/**
 * Shared Meta Cloud WhatsApp credentials + low-level send helpers.
 * Used by OTP gate and payment invites. Dry-run when token/phone id unset.
 */
import { config } from "../config.js";
import { resolveRuntimeSecret } from "./merchant-tokens.js";

export interface WhatsAppCreds {
  token: string;
  phoneId: string;
  templateName: string;
  templateLang: string;
}

export function whatsappCreds(): WhatsAppCreds {
  const token =
    resolveRuntimeSecret("WHATSAPP_TOKEN") || config.whatsappToken || "";
  const phoneId =
    resolveRuntimeSecret("WHATSAPP_PHONE_ID") || config.whatsappPhoneId || "";
  const templateName =
    resolveRuntimeSecret("WHATSAPP_TEMPLATE_NAME") ||
    config.whatsappTemplateName ||
    "nxpayment_otp";
  const templateLang =
    resolveRuntimeSecret("WHATSAPP_TEMPLATE_LANG") ||
    config.whatsappTemplateLang ||
    "en";
  return { token, phoneId, templateName, templateLang };
}

export function whatsappConfigured(): boolean {
  const { token, phoneId } = whatsappCreds();
  return Boolean(token && phoneId);
}

export function normalizeE164(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (!digits.startsWith("+")) {
    throw new Error("Phone must be E.164 (e.g. +919876543210)");
  }
  if (digits.length < 10 || digits.length > 16) {
    throw new Error("Invalid E.164 phone length");
  }
  return digits;
}

export async function metaGraphJson(
  path: string,
  init: RequestInit
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const { token } = whatsappCreds();
  const url = path.startsWith("http")
    ? path
    : `https://graph.facebook.com/v21.0/${path.replace(/^\//, "")}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };
  const res = await fetch(url, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}
