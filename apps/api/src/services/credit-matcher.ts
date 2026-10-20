import { nanoid } from "nanoid";
import {
  IN_PROGRESS_STATUSES,
  type PaymentDto,
} from "../../../../packages/shared/src/index.ts";
import { getDb } from "../db/schema.js";
import {
  parseBankEmail,
  parseBankNotification,
  parseBankSms,
  parseCreditText,
} from "./bank-alert-parser.js";
import { getMerchantConfig } from "./merchant.js";
import { findInProgressSameAmount, getPayment, merchantConfirm } from "./payments.js";
import { pushAlert } from "./risk.js";

export type CreditSource =
  | "android_notification"
  | "sms"
  | "email_gmail"
  | "email_yahoo"
  | "email_mock"
  | "manual";

export interface CreditObserveInput {
  amountPaise?: number;
  utr?: string;
  rawText?: string;
  subject?: string;
  source: CreditSource;
  observedAt?: string;
}

export type CreditMatchOutcome =
  | "confirmed"
  | "skipped_ambiguous"
  | "skipped_no_match"
  | "skipped_disabled"
  | "idempotent"
  | "parse_failed";

export interface CreditObserveResult {
  outcome: CreditMatchOutcome;
  observationId: string;
  paymentId?: string;
  payment?: PaymentDto;
  message: string;
  candidates?: PaymentDto[];
}

/** Extract amount (paise) and optional UTR from bank/UPI SMS or email text. */
export function parseCreditText(rawText: string): {
  amountPaise?: number;
  utr?: string;
} {
  const text = rawText.replace(/\s+/g, " ").trim();
  let amountPaise: number | undefined;
  let utr: string | undefined;

  const inr =
    text.match(
      /(?:INR|Rs\.?|₹)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)/i
    ) ??
    text.match(
      /(?:credited|received|cr\.?)\s+(?:with\s+)?(?:INR|Rs\.?|₹)?\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)/i
    );
  if (inr?.[1]) {
    const rupees = Number(inr[1].replace(/,/g, ""));
    if (Number.isFinite(rupees) && rupees > 0) {
      amountPaise = Math.round(rupees * 100);
    }
  }

  const utrMatch =
    text.match(/\b(?:UTR|Ref(?:erence)?(?:\s*(?:No|Number|#))?)\s*[:#-]?\s*([A-Z0-9]{8,22})\b/i) ??
    text.match(/\b([0-9]{12})\b/);
  if (utrMatch?.[1]) utr = utrMatch[1].toUpperCase();

  return { amountPaise, utr };
}

function auditObserver(
  paymentId: string | null,
  action: string,
  detail: string
) {
  getDb()
    .prepare(
      `INSERT INTO audit_log (payment_id, action, detail, created_at) VALUES (?, ?, ?, ?)`
    )
    .run(paymentId, action, detail, new Date().toISOString());
}

function insertObservation(row: {
  id: string;
  paymentId: string | null;
  amountPaise: number | null;
  utr: string | null;
  source: string;
  rawText: string | null;
  outcome: string;
  detail: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO credit_observations (
        id, payment_id, amount_paise, utr, source, raw_text, outcome, detail, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.id,
      row.paymentId,
      row.amountPaise,
      row.utr,
      row.source,
      row.rawText,
      row.outcome,
      row.detail,
      new Date().toISOString()
    );
}

/** Match an observed bank/UPI credit to an in-progress payment and optionally auto-confirm. */
export async function observeCredit(
  input: CreditObserveInput
): Promise<CreditObserveResult> {
  const observationId = nanoid(16);
  const merchant = getMerchantConfig();

  if (!merchant.autoConfirmEnabled && input.source !== "manual") {
    insertObservation({
      id: observationId,
      paymentId: null,
      amountPaise: input.amountPaise,
      utr: input.utr ?? null,
      source: input.source,
      rawText: input.rawText ?? null,
      outcome: "skipped_disabled",
      detail: "autoConfirmEnabled=false",
    });
    auditObserver(null, "credit:skipped_disabled", input.source);
    return {
      outcome: "skipped_disabled",
      observationId,
      message: "Auto-confirm is disabled. Use manual Confirm on pending.",
    };
  }

  let amountPaise = input.amountPaise;
  let utr = input.utr?.trim() || undefined;

  // Prefer YouPI-inspired bank alert parsers when raw text is present
  if (input.rawText || input.subject) {
    let parsedAmount: number | undefined;
    let parsedUtr: string | undefined;

    if (
      input.source === "email_gmail" ||
      input.source === "email_yahoo" ||
      input.source === "email_mock"
    ) {
      const p = parseBankEmail({
        subject: input.subject ?? "",
        body: input.rawText ?? "",
      });
      parsedAmount = p?.amountPaise;
      parsedUtr = p?.bankReferenceNumber;
    } else if (input.source === "sms") {
      const p = parseBankSms({ text: input.rawText ?? "" });
      parsedAmount = p?.amountPaise;
      parsedUtr = p?.bankReferenceNumber;
    } else if (input.source === "android_notification") {
      const p = parseBankNotification(input.rawText ?? "");
      parsedAmount = p?.amountPaise;
      parsedUtr = p?.bankReferenceNumber;
    } else {
      const p = parseCreditText(input.rawText ?? input.subject ?? "");
      parsedAmount = p.amountPaise;
      parsedUtr = p.utr;
    }

    if ((!amountPaise || amountPaise <= 0) && parsedAmount) amountPaise = parsedAmount;
    if (!utr && parsedUtr) utr = parsedUtr;
  }

  if (!Number.isInteger(amountPaise) || !amountPaise || amountPaise <= 0) {
    insertObservation({
      id: observationId,
      paymentId: null,
      amountPaise: null,
      utr: utr ?? null,
      source: input.source,
      rawText: input.rawText ?? null,
      outcome: "parse_failed",
      detail: "missing amountPaise",
    });
    return {
      outcome: "parse_failed",
      observationId,
      message: "Could not determine credit amount in paise",
    };
  }

  if (utr) {
    const prior = getDb()
      .prepare(
        `SELECT id, payment_id, outcome FROM credit_observations
         WHERE utr = ? AND outcome IN ('confirmed','idempotent') LIMIT 1`
      )
      .get(utr) as { id: string; payment_id: string | null; outcome: string } | undefined;
    if (prior?.payment_id) {
      const payment = getPayment(prior.payment_id);
      insertObservation({
        id: observationId,
        paymentId: prior.payment_id,
        amountPaise,
        utr,
        source: input.source,
        rawText: input.rawText ?? null,
        outcome: "idempotent",
        detail: `duplicate utr=${utr}`,
      });
      return {
        outcome: "idempotent",
        observationId,
        paymentId: prior.payment_id,
        payment: payment ?? undefined,
        message: "UTR already matched; no duplicate confirm",
      };
    }
  }

  const candidates = findInProgressSameAmount(amountPaise);
  if (candidates.length === 0) {
    insertObservation({
      id: observationId,
      paymentId: null,
      amountPaise,
      utr: utr ?? null,
      source: input.source,
      rawText: input.rawText ?? null,
      outcome: "skipped_no_match",
      detail: "no ACTIVE/PROCESSING for amount",
    });
    auditObserver(null, "credit:no_match", `amount=${amountPaise}`);
    return {
      outcome: "skipped_no_match",
      observationId,
      message: "No in-progress payment for this amount",
      candidates: [],
    };
  }

  if (candidates.length > 1) {
    insertObservation({
      id: observationId,
      paymentId: null,
      amountPaise,
      utr: utr ?? null,
      source: input.source,
      rawText: input.rawText ?? null,
      outcome: "skipped_ambiguous",
      detail: `candidates=${candidates.map((c) => c.id).join(",")}`,
    });
    auditObserver(
      null,
      "credit:ambiguous",
      `amount=${amountPaise} count=${candidates.length}`
    );
    pushAlert({
      kind: "auto_confirm_ambiguous",
      severity: "warning",
      title: "Auto-confirm skipped (ambiguous amount)",
      body: `${candidates.length} in-progress payments at ${amountPaise} paise — confirm manually.`,
    });
    return {
      outcome: "skipped_ambiguous",
      observationId,
      message:
        "Multiple in-progress payments share this amount — confirm manually.",
      candidates,
    };
  }

  const target = candidates[0]!;
  if (target.status !== "ACTIVE" && target.status !== "PROCESSING") {
    return {
      outcome: "skipped_no_match",
      observationId,
      message: `Payment ${target.id} is ${target.status}`,
      candidates,
    };
  }

  const payment = await merchantConfirm(target.id);
  insertObservation({
    id: observationId,
    paymentId: payment.id,
    amountPaise,
    utr: utr ?? null,
    source: input.source,
    rawText: input.rawText ?? null,
    outcome: "confirmed",
    detail: `auto-confirm via ${input.source}`,
  });
  auditObserver(
    payment.id,
    "credit:confirmed",
    `source=${input.source} utr=${utr ?? "-"}`
  );
  pushAlert({
    kind: "auto_confirm_success",
    severity: "info",
    title: "Auto-confirmed payment",
    body: `Via ${input.source}${utr ? ` UTR ${utr}` : ""}`,
    paymentId: payment.id,
  });

  return {
    outcome: "confirmed",
    observationId,
    paymentId: payment.id,
    payment,
    message: "Matched unique in-progress payment and confirmed",
  };
}

export function listCreditObservations(limit = 50) {
  return getDb()
    .prepare(
      `SELECT id, payment_id as paymentId, amount_paise as amountPaise, utr, source,
              outcome, detail, created_at as createdAt
       FROM credit_observations ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit);
}

export function listInProgressStatuses() {
  return IN_PROGRESS_STATUSES;
}
