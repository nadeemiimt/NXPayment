import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

export const config = {
  port: Number(process.env.API_PORT ?? 3847),
  host: process.env.API_HOST ?? "0.0.0.0",
  dbPath: process.env.DB_PATH ?? path.join(process.cwd(), "../../data/nxpayment.sqlite"),
  adminToken: env("ADMIN_TOKEN", "dev-admin-token"),
  webhookSecret: env("WEBHOOK_SECRET", "dev-webhook-secret"),
  webhookUrl: process.env.WEBHOOK_URL ?? "",
  primaryVpa: env("PRIMARY_VPA", "merchant@upi"),
  secondaryVpa: process.env.SECONDARY_VPA ?? "",
  displayName: process.env.MERCHANT_DISPLAY_NAME ?? "Merchant",
  brandName: process.env.BRAND_NAME ?? "NXPayment",
  accentColor: process.env.ACCENT_COLOR ?? "#0B6E4F",
  logoUrl: process.env.LOGO_URL ?? "",
  paymentTtlMs: Number(process.env.PAYMENT_TTL_MS ?? 5 * 60 * 1000),
  expirePollMs: Number(process.env.EXPIRE_POLL_MS ?? 5000),
  circuitFailureThreshold: Number(process.env.CIRCUIT_FAILURE_THRESHOLD ?? 5),
  circuitResetMs: Number(process.env.CIRCUIT_RESET_MS ?? 30_000),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  emailPollMs: Number(process.env.EMAIL_POLL_MS ?? 30_000),
  gmailClientId: process.env.GMAIL_CLIENT_ID ?? "",
  gmailClientSecret: process.env.GMAIL_CLIENT_SECRET ?? "",
  /** Google OAuth authorized redirect URI (API port). Override for hosted deploys. */
  gmailRedirectUri:
    process.env.GMAIL_REDIRECT_URI ??
    `http://127.0.0.1:${process.env.API_PORT ?? 3847}/api/oauth/google/callback`,
  /**
   * Key for encrypting merchant secrets at rest (AES-256-GCM).
   * Prefer SECRETS_KEY; falls back to ADMIN_TOKEN so each install can rotate.
   * If neither is strong/unique, ciphertext is still better than plaintext — protect the DB file.
   */
  secretsKey:
    process.env.SECRETS_KEY?.trim() ||
    process.env.ADMIN_TOKEN?.trim() ||
    "dev-secrets-key",

  yahooClientId: process.env.YAHOO_CLIENT_ID ?? "",
  yahooClientSecret: process.env.YAHOO_CLIENT_SECRET ?? "",
  yahooImapHost: process.env.YAHOO_IMAP_HOST ?? "",
  whatsappToken: process.env.WHATSAPP_TOKEN ?? "",
  whatsappPhoneId: process.env.WHATSAPP_PHONE_ID ?? "",
  whatsappTemplateName: process.env.WHATSAPP_TEMPLATE_NAME ?? "nxpayment_otp",
  whatsappTemplateLang: process.env.WHATSAPP_TEMPLATE_LANG ?? "en",
  whatsappOtpTtlMs: Number(process.env.WHATSAPP_OTP_TTL_MS ?? 10 * 60 * 1000),
};
