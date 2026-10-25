/**
 * WhatsApp OTP gate (YouPI-style Phase C).
 * Dry-run/stub when WHATSAPP_TOKEN + WHATSAPP_PHONE_ID unset;
 * Meta Cloud API template send when configured.
 */
import { createHash, randomInt } from "node:crypto";
import { nanoid } from "nanoid";
import { config } from "../config.js";
import { getDb } from "../db/schema.js";
import {
  metaGraphJson,
  normalizeE164,
  whatsappConfigured,
  whatsappCreds,
} from "./whatsapp-meta.js";
import { recordWhatsAppOutbound } from "./whatsapp-audit.js";

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

export function whatsappOtpStatus(): OtpStatus {
  const { token, phoneId, templateName, templateLang } = whatsappCreds();
  const tokenSet = Boolean(token);
  const phoneNumberIdSet = Boolean(phoneId);
  const configured = tokenSet && phoneNumberIdSet;
  return {
    configured,
    mode: configured ? "meta_cloud" : "stub",
    templateName,
    templateLang,
    phoneNumberIdSet,
    tokenSet,
  };
}

async function sendMetaCloudTemplate(input: {
  toE164: string;
  code: string;
}): Promise<{ ok: boolean; messageId?: string; detail: string }> {
  const { phoneId, templateName, templateLang } = whatsappCreds();
  const to = input.toE164.replace(/^\+/, "");
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLang },
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
    const res = await metaGraphJson(`${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = res.data.error as { message?: string } | undefined;
      return {
        ok: false,
        detail:
          err?.message ??
          `Meta Cloud API HTTP ${res.status} — check token, phone id, and template`,
      };
    }
    const messages = res.data.messages as Array<{ id?: string }> | undefined;
    return {
      ok: true,
      messageId: messages?.[0]?.id,
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
}): Promise<
  Omit<OtpSendResult, "challengeId" | "expiresAt" | "stubCode"> & { stubCode?: string }
> {
  if (!whatsappConfigured()) {
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
  recordWhatsAppOutbound({
    kind: "otp",
    toPhoneE164: phone,
    mode: sent.mode,
    ok: sent.ok,
    messageId: sent.messageId ?? null,
    detail: sent.detail,
  });
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
