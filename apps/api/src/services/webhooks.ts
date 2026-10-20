import { createHmac } from "node:crypto";
import { nanoid } from "nanoid";
import { config } from "../config.js";
import { getDb } from "../db/schema.js";
import { CircuitBreaker } from "../lib/circuit-breaker.js";
import { getMerchantConfig } from "./merchant.js";

export const sideEffectBreaker = new CircuitBreaker(
  config.circuitFailureThreshold,
  config.circuitResetMs
);

export async function dispatchTerminalWebhook(
  payment: Record<string, unknown>,
  event: string
) {
  const merchant = getMerchantConfig();
  const url = merchant.webhookUrl;
  const payload = {
    event,
    payment,
    deliveredAt: new Date().toISOString(),
  };
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", merchant.webhookSecret)
    .update(body)
    .digest("hex");

  const deliveryId = nanoid();
  const createdAt = new Date().toISOString();

  if (!url) {
    getDb()
      .prepare(
        `INSERT INTO webhook_deliveries
          (id, payment_id, event, payload, status, response_code, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        deliveryId,
        payment.id,
        event,
        body,
        "skipped_no_url",
        null,
        "No webhook URL configured — payload logged only",
        createdAt
      );
    console.log(`[webhook:skip] ${event} payment=${payment.id}`, payload);
    return { skipped: true, deliveryId };
  }

  try {
    await sideEffectBreaker.run(async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-NXPayment-Signature": signature,
          "X-NXPayment-Event": event,
        },
        body,
      });
      const text = await res.text().catch(() => "");
      getDb()
        .prepare(
          `INSERT INTO webhook_deliveries
            (id, payment_id, event, payload, status, response_code, error, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          deliveryId,
          payment.id,
          event,
          body,
          res.ok ? "delivered" : "failed",
          res.status,
          res.ok ? null : text.slice(0, 500),
          createdAt
        );
      if (!res.ok) {
        throw new Error(`Webhook HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      console.log(`[webhook:ok] ${event} payment=${payment.id} status=${res.status}`);
    });
    return { skipped: false, deliveryId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const existing = getDb()
      .prepare("SELECT id FROM webhook_deliveries WHERE id = ?")
      .get(deliveryId);
    if (!existing) {
      getDb()
        .prepare(
          `INSERT INTO webhook_deliveries
            (id, payment_id, event, payload, status, response_code, error, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          deliveryId,
          payment.id,
          event,
          body,
          "failed",
          null,
          message,
          createdAt
        );
    }
    console.error(`[webhook:err] ${event} payment=${payment.id}`, message);
    return { skipped: false, deliveryId, error: message };
  }
}

export function listWebhookDeliveries(limit = 50) {
  return getDb()
    .prepare(
      `SELECT id, payment_id as paymentId, event, status, response_code as responseCode,
              error, created_at as createdAt
       FROM webhook_deliveries ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit);
}
