/**
 * Light outbound WhatsApp audit (no secrets / tokens / OTP codes).
 */
import { nanoid } from "nanoid";
import { getDb } from "../db/schema.js";

export type WhatsAppOutboundKind = "otp" | "payment_invite";

export function recordWhatsAppOutbound(input: {
  kind: WhatsAppOutboundKind;
  paymentId?: string | null;
  toPhoneE164: string;
  mode: "stub" | "meta_cloud";
  ok: boolean;
  messageId?: string | null;
  detail: string;
}): string {
  const id = nanoid(16);
  const now = new Date().toISOString();
  // Mask middle of phone for audit display safety
  const phone = input.toPhoneE164;
  const masked =
    phone.length > 6
      ? `${phone.slice(0, 3)}…${phone.slice(-4)}`
      : phone;
  getDb()
    .prepare(
      `INSERT INTO whatsapp_outbound_audit (
        id, kind, payment_id, to_phone_masked, mode, ok, message_id, detail, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.kind,
      input.paymentId ?? null,
      masked,
      input.mode,
      input.ok ? 1 : 0,
      input.messageId ?? null,
      input.detail.slice(0, 500),
      now
    );
  return id;
}

export function listWhatsAppOutbound(limit = 20): Array<{
  id: string;
  kind: string;
  paymentId: string | null;
  toPhoneMasked: string;
  mode: string;
  ok: boolean;
  messageId: string | null;
  detail: string;
  createdAt: string;
}> {
  const rows = getDb()
    .prepare(
      `SELECT id, kind, payment_id as paymentId, to_phone_masked as toPhoneMasked,
              mode, ok, message_id as messageId, detail, created_at as createdAt
       FROM whatsapp_outbound_audit
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(Math.min(100, Math.max(1, limit))) as Array<{
    id: string;
    kind: string;
    paymentId: string | null;
    toPhoneMasked: string;
    mode: string;
    ok: number;
    messageId: string | null;
    detail: string;
    createdAt: string;
  }>;
  return rows.map((r) => ({
    ...r,
    ok: Boolean(r.ok),
  }));
}
