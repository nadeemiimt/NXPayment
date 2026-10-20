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
| Single-slot FIFO UPI queue | Yes | **Shipped** (`singleSlotFifo`, default on) | B |
| WhatsApp OTP gate | Yes | **Scaffold** (adapter + env; live Meta later) | C |
| Risk scores on payments | — | **Scaffold** (signals + UI) — **NX unique** | D |
| Merchant alert center | Partial | **Scaffold** (in-app + webhook hook) — **NX unique** | D |
| Offline till Cash / Card-at-counter | Yes | Planned | E |
| White-label branding | Partial | Partial (brand fields); domain hardening planned | E |
| Aggregator webhooks as SoT | Avoided | **Never** for verification MVP | — |

---

## Build phases

### Phase A — Verification (primary)
Real-time **Bank SMS + Gmail** parse → matcher → auto-confirm; manual Confirm backup; Android observer; iOS via email; Web Gmail connect (+ Yahoo optional).

### Phase B — Queue & mismatch
**Invariant single-slot FIFO**: at most one `ACTIVE`/`PROCESSING` payment unless merchant overrides (`confirmDuplicate` / `overrideFifo`). Aligns with same-amount 409.

### Phase C — WhatsApp OTP
Buyer/merchant OTP gate via Meta Cloud API adapter (env credentials) or stub.

### Phase D — Risk + alerts (**NX unique**)
Pluggable risk score on payments; merchant alert center + optional webhook for high-risk / expired / auto-confirm outcomes.

### Phase E — Till desk + white-label
Cash & card-at-counter modes; stronger white-label.

---

## YouPI modules that inspired NXPayment parsers

| YouPI path | NXPayment landing |
| --- | --- |
| `apps/gmail-observer/src/parser.js` (`BankEmailParser`, `extractIntelligentAmount`) | `apps/api/src/services/bank-alert-parser.ts` |
| `apps/sms-observer/src/sms-parser.js` (`BankSmsParser`) | same module (`parseBankSms`) |
| `apps/android-observer-app/.../PaymentNotificationListenerService.java` | `apps/mobile/.../CreditNotificationListener.kt` |
| Gmail poller / OAuth service | `apps/api/src/services/email/*` (adapters; live OAuth when env set) |

YouPI has no clear OSS license grant in-repo — we **reimplemented patterns**, did not vendor blobs. See [`auto-confirm.md`](./auto-confirm.md).
