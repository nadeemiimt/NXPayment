/**
 * Canonical inventory of merchant install tokens/secrets.
 * Keep in sync with docs/required-tokens.md and deploy/.env.example.
 */

export type TokenRequirement = "required" | "recommended" | "optional";
export type TokenKind = "secret" | "config" | "bootstrap";
export type TokenPersist =
  | "merchant_secrets"
  | "merchant_oauth_app"
  | "merchant_config"
  | "env_file"
  | "env_readonly";

export type TokenDef = {
  key: string;
  label: string;
  description: string;
  requirement: TokenRequirement;
  kind: TokenKind;
  persist: TokenPersist;
  /** Group for UI sections */
  group:
    | "run"
    | "bootstrap"
    | "webhooks"
    | "gmail"
    | "yahoo"
    | "whatsapp"
    | "branding"
    | "ops";
  /** Min length when updating (secrets); config may be shorter */
  minLength?: number;
  maxLength?: number;
  /** Non-secret values may be shown without reveal for UX (still copyable) */
  sensitive: boolean;
};

export const TOKEN_DEFS: TokenDef[] = [
  {
    key: "PRIMARY_VPA",
    label: "Primary VPA",
    description: "Merchant UPI receiving address used on checkout.",
    requirement: "required",
    kind: "config",
    persist: "merchant_config",
    group: "run",
    minLength: 5,
    maxLength: 128,
    sensitive: false,
  },
  {
    key: "SECONDARY_VPA",
    label: "Secondary VPA",
    description: "Optional fallback receiving VPA.",
    requirement: "optional",
    kind: "config",
    persist: "merchant_config",
    group: "run",
    minLength: 5,
    maxLength: 128,
    sensitive: false,
  },
  {
    key: "MERCHANT_DISPLAY_NAME",
    label: "Merchant display name",
    description: "Payee name shown on UPI intents.",
    requirement: "recommended",
    kind: "config",
    persist: "merchant_config",
    group: "run",
    minLength: 1,
    maxLength: 64,
    sensitive: false,
  },
  {
    key: "ADMIN_TOKEN",
    label: "Admin token",
    description: "Protects merchant admin APIs. Bootstrap via .env; change the default before prod.",
    requirement: "required",
    kind: "bootstrap",
    persist: "env_file",
    group: "bootstrap",
    minLength: 8,
    maxLength: 256,
    sensitive: true,
  },
  {
    key: "SECRETS_KEY",
    label: "Secrets encryption key",
    description:
      "AES-256-GCM key material for secrets at rest. Falls back to ADMIN_TOKEN if unset. Rotating without re-saving secrets breaks old ciphertext.",
    requirement: "recommended",
    kind: "bootstrap",
    persist: "env_file",
    group: "bootstrap",
    minLength: 8,
    maxLength: 256,
    sensitive: true,
  },
  {
    key: "WEBHOOK_SECRET",
    label: "Webhook signing secret",
    description: "HMAC-SHA256 key for X-NXPayment-Signature on outbound webhooks.",
    requirement: "required",
    kind: "secret",
    persist: "merchant_config",
    group: "webhooks",
    minLength: 8,
    maxLength: 256,
    sensitive: true,
  },
  {
    key: "WEBHOOK_URL",
    label: "Webhook URL",
    description: "HTTPS endpoint for payment terminal events. Empty → payloads logged only.",
    requirement: "optional",
    kind: "config",
    persist: "merchant_config",
    group: "webhooks",
    minLength: 8,
    maxLength: 2048,
    sensitive: false,
  },
  {
    key: "GMAIL_CLIENT_ID",
    label: "Gmail OAuth client ID",
    description: "Google Cloud OAuth Web application client ID.",
    requirement: "optional",
    kind: "secret",
    persist: "merchant_oauth_app",
    group: "gmail",
    minLength: 8,
    maxLength: 256,
    sensitive: true,
  },
  {
    key: "GMAIL_CLIENT_SECRET",
    label: "Gmail OAuth client secret",
    description: "Google Cloud OAuth Web application client secret.",
    requirement: "optional",
    kind: "secret",
    persist: "merchant_oauth_app",
    group: "gmail",
    minLength: 8,
    maxLength: 256,
    sensitive: true,
  },
  {
    key: "GMAIL_REDIRECT_URI",
    label: "Gmail OAuth redirect URI",
    description: "Authorized redirect URI registered in Google Cloud Console.",
    requirement: "optional",
    kind: "config",
    persist: "env_file",
    group: "gmail",
    minLength: 8,
    maxLength: 512,
    sensitive: false,
  },
  {
    key: "EMAIL_MAILBOX_SECRET",
    label: "Mailbox credential",
    description:
      "Gmail OAuth refresh token or Yahoo app password (also set via Auto-confirm → Connect).",
    requirement: "optional",
    kind: "secret",
    persist: "merchant_config",
    group: "gmail",
    minLength: 4,
    maxLength: 2048,
    sensitive: true,
  },
  {
    key: "YAHOO_CLIENT_ID",
    label: "Yahoo OAuth client ID",
    description: "Yahoo OAuth application client ID (when OAuth path is used).",
    requirement: "optional",
    kind: "secret",
    persist: "merchant_secrets",
    group: "yahoo",
    minLength: 4,
    maxLength: 256,
    sensitive: true,
  },
  {
    key: "YAHOO_CLIENT_SECRET",
    label: "Yahoo OAuth client secret",
    description: "Yahoo OAuth application client secret.",
    requirement: "optional",
    kind: "secret",
    persist: "merchant_secrets",
    group: "yahoo",
    minLength: 4,
    maxLength: 256,
    sensitive: true,
  },
  {
    key: "YAHOO_IMAP_HOST",
    label: "Yahoo IMAP host",
    description: "IMAP host for Yahoo app-password mail fetch (e.g. imap.mail.yahoo.com).",
    requirement: "optional",
    kind: "config",
    persist: "merchant_secrets",
    group: "yahoo",
    minLength: 3,
    maxLength: 256,
    sensitive: false,
  },
  {
    key: "WHATSAPP_TOKEN",
    label: "WhatsApp (Meta) token",
    description:
      "Meta Cloud API token for OTP gate + payment invites (amount/UPI/QR). Unset → dry-run stub.",
    requirement: "optional",
    kind: "secret",
    persist: "merchant_secrets",
    group: "whatsapp",
    minLength: 8,
    maxLength: 512,
    sensitive: true,
  },
  {
    key: "WHATSAPP_PHONE_ID",
    label: "WhatsApp phone number ID",
    description: "Meta WhatsApp Business phone number id.",
    requirement: "optional",
    kind: "secret",
    persist: "merchant_secrets",
    group: "whatsapp",
    minLength: 4,
    maxLength: 64,
    sensitive: true,
  },
  {
    key: "WHATSAPP_TEMPLATE_NAME",
    label: "WhatsApp OTP template name",
    description: "Approved message template name (default nxpayment_otp).",
    requirement: "optional",
    kind: "config",
    persist: "merchant_secrets",
    group: "whatsapp",
    minLength: 1,
    maxLength: 128,
    sensitive: false,
  },
  {
    key: "WHATSAPP_TEMPLATE_LANG",
    label: "WhatsApp OTP template language",
    description: "Template language code (default en).",
    requirement: "optional",
    kind: "config",
    persist: "merchant_secrets",
    group: "whatsapp",
    minLength: 2,
    maxLength: 16,
    sensitive: false,
  },
  {
    key: "BRAND_NAME",
    label: "Brand name",
    description: "White-label product name on checkout chrome.",
    requirement: "optional",
    kind: "config",
    persist: "merchant_config",
    group: "branding",
    minLength: 1,
    maxLength: 64,
    sensitive: false,
  },
  {
    key: "ACCENT_COLOR",
    label: "Accent color",
    description: "Brand accent (CSS color).",
    requirement: "optional",
    kind: "config",
    persist: "merchant_config",
    group: "branding",
    minLength: 4,
    maxLength: 32,
    sensitive: false,
  },
  {
    key: "LOGO_URL",
    label: "Logo URL",
    description: "Optional logo image URL for checkout.",
    requirement: "optional",
    kind: "config",
    persist: "merchant_config",
    group: "branding",
    minLength: 8,
    maxLength: 2048,
    sensitive: false,
  },
];

export const TOKEN_KEYS = TOKEN_DEFS.map((t) => t.key);

export function getTokenDef(key: string): TokenDef | undefined {
  return TOKEN_DEFS.find((t) => t.key === key);
}
