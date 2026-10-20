# Auto-confirm (Bank SMS & Gmail)

## Product lock

**Payment Verification = Bank SMS & Gmail Alerts parsed in real time.**  
**Not** aggregator proprietary webhooks (Razorpay/Cashfree-style) as the source of truth.

Manual **Confirm / Reject** on Pending always remains available when parse/match is ambiguous.

This is **not** NPCI-certified. Reconcile against bank records.

---

## How it works

1. Observer (Android notification/SMS, or Gmail poller / mock ingest) sends text to `POST /api/credits/observe` (alias `POST /api/payments/match-credit`).
2. **YouPI-inspired** parser extracts amount (paise), optional UTR/ref, optional sender VPA.
3. Matcher finds in-progress payments for that amount:
   - **0** → skip  
   - **1** → auto `SUCCESS` (if auto-confirm enabled)  
   - **>1** → **no auto-confirm** (ambiguous) — merchant confirms manually  
4. Observations are audited in `credit_observations`.

---

## Enable locally

```bash
nvm use 20
cd /Users/mohdnadeem/Documents/NXPayment
npm run dev:up
```

### Web (Gmail / mock)

1. Open http://127.0.0.1:4321/merchant/auto-confirm  
2. Turn **Enable auto-confirm** On  
3. Connect **mock** (or gmail when `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` are set)  
4. Paste a bank credit email sample → **Ingest & poll**  
5. Or create a unique-amount checkout, then ingest an email for that amount

### Android (SMS / notifications)

1. Flutter merchant app → **Auto-confirm**  
2. Enable Android toggle → grant **Notification access**  
3. Listener posts notification text to `/api/credits/observe`  
4. Dev: paste SMS sample in-app and send to API

### iOS

iOS **cannot** read SMS or other apps’ notifications. Use **Gmail/email poller** on the API (same Web Auto-confirm page). Optional local notification later when auto-confirmed.

### Yahoo

Secondary. Adapter + connect UI exist; IMAP/OAuth when env configured.

---

## YouPI reference (parser)

Inspired by (clean reimplementation — YouPI license unclear in-repo):

- `apps/gmail-observer/src/parser.js`
- `apps/sms-observer/src/sms-parser.js`

Landed in: `apps/api/src/services/bank-alert-parser.ts` → wired through `credit-matcher.ts`.

Changes for NXPayment: number paise (not bigint), single Fastify API (not separate observer microservices), FIFO + risk hooks, merchant toggles in SQLite.

---

## Env (optional live Gmail)

```
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
EMAIL_POLL_MS=30000
YAHOO_CLIENT_ID=
YAHOO_CLIENT_SECRET=
YAHOO_IMAP_HOST=
```

Without Gmail OAuth, use **mock ingest** for end-to-end matching.
