/**
 * WhatsApp OTP gate scaffold (YouPI-style).
 * Stub by default; Meta Cloud API adapter when WHATSAPP_TOKEN + WHATSAPP_PHONE_ID set.
 */
import { config } from "../config.js";

export interface OtpSendResult {
  ok: boolean;
  mode: "stub" | "meta_cloud";
  messageId?: string;
  detail: string;
}

export async function sendWhatsAppOtp(input: {
  toE164: string;
  code: string;
}): Promise<OtpSendResult> {
  const token = process.env.WHATSAPP_TOKEN ?? "";
  const phoneId = process.env.WHATSAPP_PHONE_ID ?? "";
  if (!token || !phoneId) {
    return {
      ok: true,
      mode: "stub",
      detail: `Stub OTP ${input.code} for ${input.toE164} (set WHATSAPP_TOKEN + WHATSAPP_PHONE_ID for live)`,
    };
  }
  // Live Meta Cloud API call would go here
  void config;
  return {
    ok: true,
    mode: "meta_cloud",
    detail: "Meta Cloud adapter placeholder — wire template send in Phase C follow-up",
  };
}
