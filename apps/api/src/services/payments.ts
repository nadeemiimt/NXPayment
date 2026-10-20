import { nanoid } from "nanoid";
import {
  IN_PROGRESS_STATUSES,
  type PaymentDto,
  type PaymentStatus,
  type TallyReport,
} from "../../../../packages/shared/src/index.ts";
import { config } from "../config.js";
import { getDb } from "../db/schema.js";
import { upiDirectRail } from "../rails/upi-direct.js";
import { getMerchantConfig, resolveReceivingVpa } from "./merchant.js";
import {
  computeRiskScore,
  gatherCreateSignals,
  maybeAlertHighRisk,
  persistPaymentRisk,
  pushAlert,
} from "./risk.js";
import { dispatchTerminalWebhook } from "./webhooks.js";

interface PaymentRow {
  id: string;
  merchant_order_id: string | null;
  amount_paise: number;
  currency: string;
  status: PaymentStatus;
  note: string | null;
  receiving_vpa: string;
  receiving_name: string;
  upi_uri: string;
  idempotency_key: string | null;
  confirm_duplicate: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
  confirmed_at: string | null;
  failure_reason: string | null;
  risk_score?: number | null;
  risk_signals?: string | null;
  method?: string | null;
  rail_id?: string | null;
}

function toDto(row: PaymentRow): PaymentDto {
  let riskSignals: Record<string, unknown> | null = null;
  if (row.risk_signals) {
    try {
      riskSignals = JSON.parse(row.risk_signals) as Record<string, unknown>;
    } catch {
      riskSignals = null;
    }
  }
  const method =
    row.method === "cash" || row.method === "card_counter" ? row.method : "upi";
  return {
    id: row.id,
    merchantOrderId: row.merchant_order_id,
    amountPaise: row.amount_paise,
    currency: "INR",
    status: row.status,
    note: row.note,
    upiUri: row.upi_uri,
    receivingVpa: row.receiving_vpa,
    receivingName: row.receiving_name,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    confirmedAt: row.confirmed_at,
    riskScore: row.risk_score ?? 0,
    riskSignals,
    method,
    railId: row.rail_id ?? (method === "upi" ? "upi_direct" : "till_desk"),
  };
}

function audit(paymentId: string | null, action: string, detail?: string) {
  getDb()
    .prepare(
      `INSERT INTO audit_log (payment_id, action, detail, created_at) VALUES (?, ?, ?, ?)`
    )
    .run(paymentId, action, detail ?? null, new Date().toISOString());
}

export class SameAmountInProgressError extends Error {
  constructor(public readonly existing: PaymentDto[]) {
    super("A payment with the same amount is already in progress");
    this.name = "SameAmountInProgressError";
  }
}

export class FifoSlotBusyError extends Error {
  constructor(public readonly existing: PaymentDto[]) {
    super("Single-slot FIFO: another payment is already in progress");
    this.name = "FifoSlotBusyError";
  }
}

/** In-progress UPI payments only (till cash/card do not occupy the FIFO slot). */
export function findAnyInProgress(limit = 20): PaymentDto[] {
  const placeholders = IN_PROGRESS_STATUSES.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT * FROM payments
       WHERE status IN (${placeholders})
         AND COALESCE(method, 'upi') = 'upi'
       ORDER BY created_at ASC LIMIT ?`
    )
    .all(...IN_PROGRESS_STATUSES, limit) as PaymentRow[];
  return rows.map(toDto);
}

export function findInProgressSameAmount(amountPaise: number): PaymentDto[] {
  const placeholders = IN_PROGRESS_STATUSES.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT * FROM payments WHERE amount_paise = ? AND status IN (${placeholders})
       ORDER BY created_at DESC`
    )
    .all(amountPaise, ...IN_PROGRESS_STATUSES) as PaymentRow[];
  return rows.map(toDto);
}

export async function createPayment(input: {
  amountPaise: number;
  merchantOrderId?: string;
  note?: string;
  idempotencyKey?: string;
  confirmDuplicate?: boolean;
  /** Explicit override of single-slot FIFO (also implied by confirmDuplicate). */
  overrideFifo?: boolean;
}): Promise<PaymentDto> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new Error("amountPaise must be a positive integer");
  }

  if (input.idempotencyKey) {
    const existing = getDb()
      .prepare("SELECT * FROM payments WHERE idempotency_key = ?")
      .get(input.idempotencyKey) as PaymentRow | undefined;
    if (existing) return toDto(existing);
  }

  const merchant = getMerchantConfig();
  const allowOverride = Boolean(input.confirmDuplicate || input.overrideFifo);
  if (merchant.singleSlotFifo) {
    const open = findAnyInProgress();
    if (open.length > 0 && !allowOverride) {
      pushAlert({
        kind: "queue_blocked",
        severity: "warning",
        title: "UPI queue busy (single-slot FIFO)",
        body: `In-progress: ${open.map((p) => p.id).join(", ")}`,
        paymentId: open[0]?.id,
      });
      throw new FifoSlotBusyError(open);
    }
  }

  const conflicts = findInProgressSameAmount(input.amountPaise);
  if (conflicts.length > 0 && !input.confirmDuplicate) {
    throw new SameAmountInProgressError(conflicts);
  }

  const receiving = resolveReceivingVpa();
  const id = nanoid(16);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.paymentTtlMs);

  const checkout = await upiDirectRail.createCheckout({
    id,
    amountPaise: input.amountPaise,
    note: input.note,
    receivingVpa: receiving.vpa,
    receivingName: receiving.name,
  });

  getDb()
    .prepare(
      `INSERT INTO payments (
        id, merchant_order_id, amount_paise, currency, status, note,
        receiving_vpa, receiving_name, upi_uri, idempotency_key, confirm_duplicate,
        created_at, updated_at, expires_at, confirmed_at, failure_reason
      ) VALUES (
        @id, @merchant_order_id, @amount_paise, 'INR', 'ACTIVE', @note,
        @receiving_vpa, @receiving_name, @upi_uri, @idempotency_key, @confirm_duplicate,
        @created_at, @updated_at, @expires_at, NULL, NULL
      )`
    )
    .run({
      id,
      merchant_order_id: input.merchantOrderId ?? null,
      amount_paise: input.amountPaise,
      note: input.note ?? null,
      receiving_vpa: receiving.vpa,
      receiving_name: receiving.name,
      upi_uri: checkout.upiUri,
      idempotency_key: input.idempotencyKey ?? null,
      confirm_duplicate: input.confirmDuplicate ? 1 : 0,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    });

  const signals = gatherCreateSignals(input.amountPaise, allowOverride);
  const score = computeRiskScore(signals);
  persistPaymentRisk(id, score, signals);
  maybeAlertHighRisk(id, score);

  audit(id, "created", `amount=${input.amountPaise} risk=${score}`);
  return getPayment(id)!;
}

export function getPayment(id: string): PaymentDto | null {
  const row = getDb().prepare("SELECT * FROM payments WHERE id = ?").get(id) as
    | PaymentRow
    | undefined;
  return row ? toDto(row) : null;
}

export function listPayments(opts: {
  status?: PaymentStatus;
  limit?: number;
}): PaymentDto[] {
  const limit = opts.limit ?? 50;
  let rows: PaymentRow[];
  if (opts.status) {
    rows = getDb()
      .prepare(
        `SELECT * FROM payments WHERE status = ? ORDER BY created_at DESC LIMIT ?`
      )
      .all(opts.status, limit) as PaymentRow[];
  } else {
    rows = getDb()
      .prepare(`SELECT * FROM payments ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as PaymentRow[];
  }
  return rows.map(toDto);
}

export function listPendingConfirms(): PaymentDto[] {
  return listPayments({ status: "ACTIVE", limit: 100 }).concat(
    listPayments({ status: "PROCESSING", limit: 100 })
  );
}

async function transition(
  id: string,
  from: PaymentStatus[],
  to: PaymentStatus,
  extra?: { failureReason?: string; confirmedAt?: string }
): Promise<PaymentDto> {
  const row = getDb().prepare("SELECT * FROM payments WHERE id = ?").get(id) as
    | PaymentRow
    | undefined;
  if (!row) throw new Error("Payment not found");
  if (!from.includes(row.status)) {
    throw new Error(`Cannot transition ${row.status} → ${to}`);
  }
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE payments SET status = ?, updated_at = ?, failure_reason = COALESCE(?, failure_reason),
        confirmed_at = COALESCE(?, confirmed_at) WHERE id = ?`
    )
    .run(to, now, extra?.failureReason ?? null, extra?.confirmedAt ?? null, id);

  audit(id, `status:${to}`, extra?.failureReason);
  const updated = getPayment(id)!;

  if (["SUCCESS", "FAILED", "EXPIRED", "CANCELLED"].includes(to)) {
    await dispatchTerminalWebhook(updated as unknown as Record<string, unknown>, `payment.${to.toLowerCase()}`);
  }
  return updated;
}

export async function merchantConfirm(id: string): Promise<PaymentDto> {
  const current = getPayment(id);
  if (!current) throw new Error("Payment not found");
  if (current.status !== "ACTIVE" && current.status !== "PROCESSING") {
    throw new Error(`Cannot confirm payment in status ${current.status}`);
  }
  // Move through PROCESSING briefly for state-machine honesty
  if (current.status === "ACTIVE") {
    getDb()
      .prepare(`UPDATE payments SET status = 'PROCESSING', updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id);
    audit(id, "status:PROCESSING", "merchant confirm started");
  }
  return transition(id, ["ACTIVE", "PROCESSING"], "SUCCESS", {
    confirmedAt: new Date().toISOString(),
  });
}

export async function merchantReject(
  id: string,
  reason?: string
): Promise<PaymentDto> {
  return transition(id, ["ACTIVE", "PROCESSING"], "FAILED", {
    failureReason: reason ?? "Rejected by merchant",
  });
}

export async function cancelPayment(id: string): Promise<PaymentDto> {
  return transition(id, ["INITIATED", "ACTIVE"], "CANCELLED", {
    failureReason: "Cancelled",
  });
}

export function expireDuePayments(): number {
  const now = new Date().toISOString();
  const due = getDb()
    .prepare(
      `SELECT id FROM payments
       WHERE status IN ('INITIATED','ACTIVE','PROCESSING') AND expires_at <= ?`
    )
    .all(now) as { id: string }[];

  for (const { id } of due) {
    getDb()
      .prepare(
        `UPDATE payments SET status = 'EXPIRED', updated_at = ?, failure_reason = ?
         WHERE id = ? AND status IN ('INITIATED','ACTIVE','PROCESSING')`
      )
      .run(now, "Payment timed out", id);
    audit(id, "status:EXPIRED", "TTL");
    pushAlert({
      kind: "expired_unpaid",
      severity: "info",
      title: "Payment expired",
      body: "Session timed out without confirm.",
      paymentId: id,
    });
    const payment = getPayment(id);
    if (payment) {
      void dispatchTerminalWebhook(
        payment as unknown as Record<string, unknown>,
        "payment.expired"
      );
    }
  }
  return due.length;
}

export function getTally(fromIso: string, toIso: string): TallyReport {
  const rows = getDb()
    .prepare(
      `SELECT status, COUNT(*) as cnt, COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN amount_paise ELSE 0 END), 0) as sales
       FROM payments
       WHERE created_at >= ? AND created_at <= ?
       GROUP BY status`
    )
    .all(fromIso, toIso) as { status: PaymentStatus; cnt: number; sales: number }[];

  const tally: TallyReport = {
    from: fromIso,
    to: toIso,
    successCount: 0,
    failedCount: 0,
    expiredCount: 0,
    cancelledCount: 0,
    paymentCount: 0,
    totalSalesPaise: 0,
  };

  for (const r of rows) {
    tally.paymentCount += r.cnt;
    if (r.status === "SUCCESS") {
      tally.successCount = r.cnt;
      tally.totalSalesPaise = r.sales;
    } else if (r.status === "FAILED") tally.failedCount = r.cnt;
    else if (r.status === "EXPIRED") tally.expiredCount = r.cnt;
    else if (r.status === "CANCELLED") tally.cancelledCount = r.cnt;
  }
  return tally;
}

/** GST extension stub — do not integrate GST in MVP. */
export async function gstExportStub(from: string, to: string) {
  return {
    stub: true as const,
    message: "GST export adapter not implemented in MVP",
    from,
    to,
  };
}

/** Reconciliation extension stub. */
export async function reconciliationStub() {
  return {
    stub: true as const,
    message: "Bank reconciliation import not implemented in MVP",
  };
}
