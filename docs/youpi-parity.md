# YouPI-PG ↔ NXPayment feature parity

**Payment Verification = Bank SMS & Gmail alerts parsed in near real time — not aggregator proprietary webhooks.**

Reference: [YouPI-PG](https://github.com/youpi-pg/YouPI-PG) (research / experimental). NXPayment stays **self-hosted, direct-to-merchant VPA**.

---

## Comparison table

| Capability | YouPI-PG | NXPayment status | Phase |
| --- | --- | --- | --- |
| Direct-to-merchant UPI settle | Yes | **Shipped** | — |
| Manual merchant Confirm/Reject | Yes | **Shipped** | — |
| Same-amount concurrency warning | Yes-ish | **Shipped** (`409` + `confirmDuplicate`) | — |
| Bank SMS parse → auto-confirm | `apps/sms-observer` | **Shipped** (Android NL + `/api/credits/observe`) | A |
| Gmail alert parse → auto-confirm | `apps/gmail-observer` parser | **Shipped** (YouPI-inspired parser + poller/mock ingest) | A |
| Yahoo mailbox | — | **Optional** adapter (secondary) | A |
| iOS SMS/notification read | N/A (OS limit) | **Documented** — iOS uses Gmail/email poller only | A |
| Single-slot FIFO UPI queue | Yes | **Shipped** (`singleSlotFifo`, default on; till sales excluded) | B |
| WhatsApp OTP gate | Yes | **Shipped** (Meta Cloud adapter + dry-run stub; checkout/onboarding UI) | C |
| Risk scores on payments | — | **Shipped** (signals + score + high-risk alerts) — **NX unique** | D |
| Merchant alert center | Partial | **Shipped** (list / read / dismiss / read-all + webhook hook) — **NX unique** | D |
| Offline till Cash / Card-at-counter | Yes | **Shipped** (`/api/till/sales` + merchant Till desk) | E |
| White-label branding | Partial | **Shipped** (`brandName` + `hideNxChrome` on checkout/merchant shells) | E |
| Aggregator webhooks as SoT | Avoided | **Never** for verification MVP | — |

---

## Build phases

### Phase A — Verification (primary) ✅
Real-time **Bank SMS + Gmail** parse → matcher → auto-confirm; manual Confirm backup; Android observer; iOS via email; Web Gmail connect (+ Yahoo optional).

### Phase B — Queue & mismatch ✅
**Invariant single-slot FIFO**: at most one `ACTIVE`/`PROCESSING` **UPI** payment unless merchant overrides (`confirmDuplicate` / `overrideFifo`). Till cash/card do not occupy the slot. Aligns with same-amount 409.

### Phase C — WhatsApp OTP ✅
Buyer/merchant OTP gate via Meta Cloud API adapter when `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID` are set; otherwise **dry-run stub** returns the code in the API response for local QA. Checkout + onboarding gate UI. See [`auto-confirm.md`](./auto-confirm.md) WhatsApp section / env below.

### Phase D — Risk + alerts (**NX unique**) ✅
Pluggable risk score on payments; merchant alert center with read / dismiss / mark-all-read; optional webhook for terminal events.

### Phase E — Till desk + white-label ✅
Cash & card-at-counter modes via `/api/till/sales`; configurable `brandName` and `hideNxChrome`.

---

## WhatsApp env (Phase C)

```bash
# Required for live Meta Cloud API send
WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=

# Optional (defaults shown)
WHATSAPP_TEMPLATE_NAME=nxpayment_otp
WHATSAPP_TEMPLATE_LANG=en
WHATSAPP_OTP_TTL_MS=600000
```

Template must accept one body parameter (the OTP) and optionally a URL button OTP param. Without token/phone id, `POST /api/otp/whatsapp/send` runs in **stub** mode and includes `stubCode` in the JSON response.

Enable the gate in **Merchant → Setup** (`whatsappOtpEnabled` + E.164 phone), then verify via the onboarding OTP panel. Checkout requires OTP when the gate is enabled (session-scoped after verify).

---

## Till desk (Phase E)

- `POST /api/till/sales` `{ amountPaise, method: "cash"|"card_counter", confirm?: true }`
- `GET /api/till/open` — open (unconfirmed) till sales
- `POST /api/till/sales/:id/confirm` — cashier confirm
- Web: **Merchant → Till**

Manual UPI Confirm remains; till does not use aggregator webhooks.

---

## Remaining gaps (non-blocking)

- Live Meta template name must match a pre-approved WhatsApp Business template in your WABA.
- Domain / custom host white-label hardening (DNS + TLS) not yet productized.
- Flutter merchant app till / OTP parity lagging web.
- Yahoo IMAP live path still secondary to Gmail/mock.

---

## YouPI modules that inspired NXPayment parsers

| YouPI path | NXPayment landing |
| --- | --- |
| `apps/gmail-observer/src/parser.js` (`BankEmailParser`, `extractIntelligentAmount`) | `apps/api/src/services/bank-alert-parser.ts` |
| `apps/sms-observer/src/sms-parser.js` (`BankSmsParser`) | same module (`parseBankSms`) |
| `apps/android-observer-app/.../PaymentNotificationListenerService.java` | `apps/mobile/.../CreditNotificationListener.kt` |
| Gmail poller / OAuth service | `apps/api/src/services/email/*` (adapters; live OAuth when env set) |

YouPI has no clear OSS license grant in-repo — we **reimplemented patterns**, did not vendor blobs. See [`auto-confirm.md`](./auto-confirm.md).
