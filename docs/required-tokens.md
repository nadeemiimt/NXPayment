# NXPayment — required tokens & secrets

Inventory of every credential / secret a **merchant install** needs to run.
Prefer the merchant **Tokens** UI (`/merchant/tokens`) for values that can live in SQLite
(AES-256-GCM). Env (`.env`) remains the bootstrap + fallback.

**Never commit real values.** Do not paste refresh tokens or client secrets into git, PRs, or chat logs.

---

## Quick table

| Key | Required to run? | Storage | Notes |
| --- | --- | --- | --- |
| `PRIMARY_VPA` | **Required** (live UPI) | DB `merchant_config` + env fallback | Receiving UPI ID; Setup / Tokens |
| `ADMIN_TOKEN` | **Required** (prod) | Env bootstrap only | Protects admin APIs; has unsafe default in dev |
| `WEBHOOK_SECRET` | **Required** (prod) | DB `merchant_config` + env | HMAC for outbound webhooks; has unsafe default in dev |
| `SECRETS_KEY` | **Strongly recommended** | Env bootstrap only | AES key for secrets at rest; falls back to `ADMIN_TOKEN` |
| `MERCHANT_DISPLAY_NAME` | Recommended | DB + env | Shown on UPI payee name |
| `SECONDARY_VPA` | Optional | DB + env | Fallback receiving VPA |
| `WEBHOOK_URL` | Optional | DB + env | Outbound payment event URL |
| `BRAND_NAME` / `ACCENT_COLOR` / `LOGO_URL` | Optional | DB + env | White-label chrome |
| `GMAIL_CLIENT_ID` | Optional* | Encrypted DB (`merchant_oauth_app`) + env | Google OAuth Web client |
| `GMAIL_CLIENT_SECRET` | Optional* | Encrypted DB + env | Pair with client id |
| `GMAIL_REDIRECT_URI` | Optional | Env (+ Tokens as hint) | Default `http://127.0.0.1:3847/api/oauth/google/callback` |
| `EMAIL_MAILBOX_SECRET` | Optional* | DB `merchant_config.email_secret` | Gmail refresh token / Yahoo app password (via Auto-confirm Connect) |
| `YAHOO_CLIENT_ID` | Optional | Encrypted DB `merchant_secrets` + env | Yahoo OAuth (planned / partial) |
| `YAHOO_CLIENT_SECRET` | Optional | Encrypted DB + env | Pair with Yahoo client id |
| `YAHOO_IMAP_HOST` | Optional | Encrypted DB + env | IMAP host when using app password |
| `WHATSAPP_TOKEN` | Optional | Encrypted DB + env | Meta Cloud API for OTP + pay invites; unset → dry-run stub |
| `WHATSAPP_PHONE_ID` | Optional | Encrypted DB + env | Meta phone number id |
| `WHATSAPP_TEMPLATE_NAME` | Optional | Encrypted DB + env | OTP template only (default `nxpayment_otp`) |
| `WHATSAPP_TEMPLATE_LANG` | Optional | Encrypted DB + env | Default `en` |
| `API_PORT` / `WEB_PORT` / `DB_PATH` / `CORS_ORIGIN` / `NEXT_PUBLIC_API_URL` | Ops | Env only | Runtime wiring — not merchant “secrets” |

\*Required **only if** you enable live Gmail/Yahoo auto-confirm (otherwise mock ingest works).

---

## Required vs optional for “run”

### Minimum to accept a UPI payment locally

| Key | Why |
| --- | --- |
| `PRIMARY_VPA` | Checkout builds `upi://` to this VPA |
| `ADMIN_TOKEN` | Merchant admin / confirm routes (change the default) |
| `WEBHOOK_SECRET` | Signs webhooks even when `WEBHOOK_URL` is empty (logged) |

Dev defaults exist for `ADMIN_TOKEN` / `WEBHOOK_SECRET` / a placeholder VPA so `npm run dev:up` boots — **do not ship those defaults**.

### Strongly recommended on any real install

| Key | Why |
| --- | --- |
| `SECRETS_KEY` | Encrypts Gmail/Yahoo/WhatsApp secrets in SQLite. Rotating it without re-saving secrets makes old ciphertext unreadable. |
| `MERCHANT_DISPLAY_NAME` | Payee name on UPI |

### Optional feature packs

| Feature | Keys |
| --- | --- |
| Outbound webhooks | `WEBHOOK_URL`, `WEBHOOK_SECRET` |
| Gmail auto-confirm | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, mailbox refresh token (`EMAIL_MAILBOX_SECRET` via Connect), `SECRETS_KEY` |
| Yahoo mailbox | `YAHOO_CLIENT_ID` / `YAHOO_CLIENT_SECRET` and/or `YAHOO_IMAP_HOST` + mailbox secret |
| WhatsApp OTP gate | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` (+ template name/lang) |
| WhatsApp pay invite (Confirm UI → buyer) | Same `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID`; unset returns stub payload with QR PNG for local QA |
| Branding | `BRAND_NAME`, `ACCENT_COLOR`, `LOGO_URL`, `hideNxChrome` (Setup) |

---

## Where values live

1. **Bootstrap env** (`.env` at repo root, from `deploy/.env.example`): `ADMIN_TOKEN`, `SECRETS_KEY`, ports, `DB_PATH`. Tokens UI can rewrite `.env` for bootstrap keys when the file is writable.
2. **SQLite encrypted** (`merchant_oauth_app` / `merchant_secrets`): Gmail client id/secret, Yahoo + WhatsApp secrets. Ciphertext uses AES-256-GCM (`SECRETS_KEY` → else `ADMIN_TOKEN`).
3. **SQLite merchant config**: VPA, branding, `webhook_secret`, mailbox connect fields.
4. **Resolution order** for feature secrets: **DB → process.env → config boot snapshot**.

---

## Merchant UI

- Path: **`/merchant/tokens`** (nav: **Tokens**)
- Also linked from Setup and Auto-confirm
- Actions: masked view · Reveal · Copy · Update · Clear (where allowed)
- Status badges: **set** / **missing** · **required** / **optional** · source `db` | `env` | `none`

First-run desktop launcher opens this page after API+Web are healthy.

---

## Related

- [`auto-confirm.md`](./auto-confirm.md) — Gmail/Yahoo connect
- [`local-real-money-testing.md`](./local-real-money-testing.md) — ₹1 live tests
- [`desktop-packages.md`](./desktop-packages.md) — Mac/Windows merchant packages
