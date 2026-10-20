/**
 * Offline till desk — Cash & Card-at-counter (YouPI Phase E).
 * Records sales that settle outside UPI intent; cashier confirm is the SoT.
 */
import { nanoid } from "nanoid";
import type { PaymentDto } from "../../../../packages/shared/src/index.ts";
import { getDb } from "../db/schema.js";
import { resolveReceivingVpa } from "./merchant.js";
import { getPayment, merchantConfirm } from "./payments.js";
import { pushAlert } from "./risk.js";

export type TillMethod = "cash" | "card_counter";

export function isTillMethod(v: string): v is TillMethod {
  return v === "cash" || v === "card_counter";
}

function tillUri(method: TillMethod, id: string): string {
  return `nxpayment://till/${method}/${id}`;
}

function audit(paymentId: string | null, action: string, detail?: string) {
  getDb()
    .prepare(
      `INSERT INTO audit_log (payment_id, action, detail, created_at) VALUES (?, ?, ?, ?)`
    )
    .run(paymentId, action, detail ?? null, new Date().toISOString());
}

export async function createTillSale(input: {
  amountPaise: number;
  method: TillMethod;
  merchantOrderId?: string;
  note?: string;
  /** When true (default), mark SUCCESS immediately after cash/card taken. */
  confirm?: boolean;
}): Promise<PaymentDto> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new Error("amountPaise must be a positive integer");
  }

  const receiving = resolveReceivingVpa();
  const id = nanoid(16);
  const now = new Date();
  // Till sessions don't need a long UPI TTL; keep a short window if left open.
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
  const uri = tillUri(input.method, id);
  const confirmNow = input.confirm !== false;

  getDb()
    .prepare(
      `INSERT INTO payments (
        id, merchant_order_id, amount_paise, currency, status, note,
        receiving_vpa, receiving_name, upi_uri, idempotency_key, confirm_duplicate,
        created_at, updated_at, expires_at, confirmed_at, failure_reason,
        method, rail_id, risk_score
      ) VALUES (
        @id, @merchant_order_id, @amount_paise, 'INR', 'ACTIVE', @note,
        @receiving_vpa, @receiving_name, @upi_uri, NULL, 0,
        @created_at, @updated_at, @expires_at, NULL, NULL,
        @method, @rail_id, 0
      )`
    )
    .run({
      id,
      merchant_order_id: input.merchantOrderId ?? null,
      amount_paise: input.amountPaise,
      note: input.note ?? `${input.method} till sale`,
      receiving_vpa: receiving.vpa,
      receiving_name: receiving.name,
      upi_uri: uri,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      method: input.method,
      rail_id: "till_desk",
    });

  audit(id, "till:created", `method=${input.method} amount=${input.amountPaise}`);

  if (confirmNow) {
    const payment = await merchantConfirm(id);
    pushAlert({
      kind: "till_sale",
      severity: "info",
      title: `Till ${input.method === "cash" ? "cash" : "card"} sale confirmed`,
      body: `Amount recorded at counter.`,
      paymentId: id,
    });
    return payment;
  }

  return getPayment(id)!;
}

export async function cashierConfirmTill(id: string): Promise<PaymentDto> {
  const payment = getPayment(id);
  if (!payment) throw new Error("Payment not found");
  if (payment.method !== "cash" && payment.method !== "card_counter") {
    throw new Error("Not a till (cash/card) payment — use UPI Confirm instead");
  }
  const confirmed = await merchantConfirm(id);
  pushAlert({
    kind: "till_sale",
    severity: "info",
    title: `Till ${payment.method} confirmed`,
    body: "Cashier marked counter payment received.",
    paymentId: id,
  });
  return confirmed;
}

export function listOpenTillSales(limit = 50): PaymentDto[] {
  const rows = getDb()
    .prepare(
      `SELECT id FROM payments
       WHERE method IN ('cash','card_counter') AND status IN ('ACTIVE','PROCESSING')
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as { id: string }[];
  return rows.map((r) => getPayment(r.id)!).filter(Boolean);
}
