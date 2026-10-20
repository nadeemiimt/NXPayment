/**
 * WhatsApp OTP gate (YouPI-style Phase C).
 * Dry-run/stub when WHATSAPP_TOKEN + WHATSAPP_PHONE_ID unset;
 * Meta Cloud API template send when configured.
 */
import { createHash, randomInt } from "node:crypto";
import { nanoid } from "nanoid";
import { config } from "../config.js";
import { getDb } from "../db/schema.js";

export type OtpPurpose = "checkout_gate" | "onboarding_gate";

export interface OtpSendResult {
  ok: boolean;
  mode: "stub" | "meta_cloud";
  challengeId: string;
  expiresAt: string;
  /** Present only in stub/dry-run so local QA can complete the gate. */
  stubCode?: string;
  messageId?: string;
  detail: string;
}

export interface OtpStatus {
  configured: boolean;
  mode: "stub" | "meta_cloud";
  templateName: string;
  templateLang: string;
  phoneNumberIdSet: boolean;
  tokenSet: boolean;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function normalizeE164(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (!digits.startsWith("+")) {
    throw new Error("Phone must be E.164 (e.g. +919876543210)");
  }
  if (digits.length < 10 || digits.length > 16) {
    throw new Error("Invalid E.164 phone length");
  }
  return digits;
}

export function whatsappOtpStatus(): OtpStatus {
  const tokenSet = Boolean(config.whatsappToken);
  const phoneNumberIdSet = Boolean(config.whatsappPhoneId);
  const configured = tokenSet && phoneNumberIdSet;
  return {
    configured,
    mode: configured ? "meta_cloud" : "stub",
    templateName: config.whatsappTemplateName,
    templateLang: config.whatsappTemplateLang,
    phoneNumberIdSet,
    tokenSet,
  };
}

async function sendMetaCloudTemplate(input: {
  toE164: string;
  code: string;
}): Promise<{ ok: boolean; messageId?: string; detail: string }> {
  const to = input.toE164.replace(/^\+/, "");
  const url = `https://graph.facebook.com/v21.0/${config.whatsappPhoneId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: config.whatsappTemplateName,
      language: { code: config.whatsappTemplateLang },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: input.code }],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: input.code }],
        },
      ],
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.whatsappToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      return {
        ok: false,
        detail:
          data.error?.message ??
          `Meta Cloud API HTTP ${res.status} — check token, phone id, and template`,
      };
    }
    return {
      ok: true,
      messageId: data.messages?.[0]?.id,
      detail: "OTP sent via Meta Cloud API template",
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Low-level send — used by challenge flow and tests. */
export async function sendWhatsAppOtp(input: {
  toE164: string;
  code: string;
}): Promise<Omit<OtpSendResult, "challengeId" | "expiresAt" | "stubCode"> & { stubCode?: string }> {
  const status = whatsappOtpStatus();
  if (!status.configured) {
    return {
      ok: true,
      mode: "stub",
      stubCode: input.code,
      detail: `Dry-run OTP ${input.code} for ${input.toE164} (set WHATSAPP_TOKEN + WHATSAPP_PHONE_ID for live Meta Cloud)`,
    };
  }
  const live = await sendMetaCloudTemplate(input);
  return {
    ok: live.ok,
    mode: "meta_cloud",
    messageId: live.messageId,
    detail: live.detail,
  };
}

export async function createAndSendOtpChallenge(input: {
  phoneE164: string;
  purpose: OtpPurpose;
}): Promise<OtpSendResult> {
  const phone = normalizeE164(input.phoneE164);
  const code = String(randomInt(100000, 999999));
  const id = nanoid(16);
  const now = Date.now();
  const expiresAt = new Date(now + config.whatsappOtpTtlMs).toISOString();

  getDb()
    .prepare(
      `INSERT INTO whatsapp_otp_challenges (
        id, phone_e164, code_hash, purpose, expires_at, verified_at, attempts, created_at
      ) VALUES (?, ?, ?, ?, ?, NULL, 0, ?)`
    )
    .run(id, phone, hashCode(code), input.purpose, expiresAt, new Date(now).toISOString());

  const sent = await sendWhatsAppOtp({ toE164: phone, code });
  if (!sent.ok) {
    return {
      ok: false,
      mode: sent.mode,
      challengeId: id,
      expiresAt,
      detail: sent.detail,
    };
  }
  return {
    ok: true,
    mode: sent.mode,
    challengeId: id,
    expiresAt,
    stubCode: sent.stubCode,
    messageId: sent.messageId,
    detail: sent.detail,
  };
}

export function verifyOtpChallenge(input: {
  challengeId: string;
  code: string;
}): { ok: boolean; purpose?: OtpPurpose; phoneE164?: string; detail: string } {
  const row = getDb()
    .prepare(
      `SELECT id, phone_e164 as phoneE164, code_hash as codeHash, purpose,
              expires_at as expiresAt, verified_at as verifiedAt, attempts
       FROM whatsapp_otp_challenges WHERE id = ?`
    )
    .get(input.challengeId) as
    | {
        id: string;
        phoneE164: string;
        codeHash: string;
        purpose: OtpPurpose;
        expiresAt: string;
        verifiedAt: string | null;
        attempts: number;
      }
    | undefined;

  if (!row) return { ok: false, detail: "Challenge not found" };
  if (row.verifiedAt) return { ok: false, detail: "Challenge already used" };
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    return { ok: false, detail: "OTP expired" };
  }
  if (row.attempts >= 5) {
    return { ok: false, detail: "Too many attempts" };
  }

  getDb()
    .prepare(`UPDATE whatsapp_otp_challenges SET attempts = attempts + 1 WHERE id = ?`)
    .run(input.challengeId);

  if (hashCode(input.code.trim()) !== row.codeHash) {
    return { ok: false, detail: "Invalid code" };
  }

  const now = new Date().toISOString();
  getDb()
    .prepare(`UPDATE whatsapp_otp_challenges SET verified_at = ? WHERE id = ?`)
    .run(now, input.challengeId);

  if (row.purpose === "onboarding_gate") {
    getDb()
      .prepare(
        `UPDATE merchant_config SET whatsapp_verified_at = ?, whatsapp_otp_phone = ?, updated_at = ? WHERE id = 1`
      )
      .run(now, row.phoneE164, now);
  }

  return {
    ok: true,
    purpose: row.purpose,
    phoneE164: row.phoneE164,
    detail: "Verified",
  };
}

export function isOnboardingOtpSatisfied(): boolean {
  const m = getDb()
    .prepare(
      `SELECT whatsapp_otp_enabled as enabled, whatsapp_verified_at as verifiedAt
       FROM merchant_config WHERE id = 1`
    )
    .get() as { enabled: number | null; verifiedAt: string | null };
  if (!m.enabled) return true;
  return Boolean(m.verifiedAt);
}
