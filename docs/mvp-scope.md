# NXPayment — MVP Scope (self-hosted UPI)

Aligned with [`project-context.md`](./project-context.md) and [`architecture-plan.md`](./architecture-plan.md).

---

## MVP goal

Ship a **per-merchant install** where a merchant can:

1. Configure **their UPI VPA**,  
2. Take a buyer through **SimpleCheckout** (UPI Intent + QR) paying **directly to that VPA**,  
3. **Confirm** the payment in merchant admin / Flutter (buyer sees live waiting → success/timeout),  
4. See **tally** (success / failed / total sales),  
5. Receive a **HMAC webhook** on terminal states —

**without** routing money through a licensed India PSP and **without** NXPayment holding funds.

---

## In scope (MVP)

### Product

- [x] **Per-merchant install** (Docker Compose) with isolated SQLite + secrets  
- [x] **Onboarding:** VPA → optional branding → test payment  
- [x] **SimpleCheckout (Web):** UPI QR + intent deep links to merchant VPA; live status while waiting; timeout UX  
- [x] **Payment state machine:** INITIATED → ACTIVE → PROCESSING → SUCCESS / FAILED / EXPIRED / CANCELLED  
- [x] **Confirmation:** merchant Confirm / Reject (primary authority)  
- [x] **Same-amount in-progress guard** with UI warning + `confirmDuplicate`  
- [x] **Timeouts + circuit breaker** on confirmation side-effects; TTL expire job  
- [x] **Merchant admin (Web):** pending confirms, payment list, tally dashboard, settings  
- [x] **Flutter merchant:** pending confirm/reject + basic tally (same API)  
- [x] Outbound **HMAC webhooks** + poll status API  
- [x] **Reports / tally:** success count, failed, total sales; GST/recon extension stubs only  
- [x] Honest product copy: software-assisted checkout; merchant reconciles bank records  

### Engineering

- [x] TypeScript Fastify API + Next.js Web  
- [x] Integer paise; UPI URI builder; idempotency keys  
- [x] `PaymentRail` port with **`upi_direct` implemented**  
- [x] **Card rail stubs only** (`visa_partner` / `mc_partner`)  
- [x] Deploy: `.env.example` with `PRIMARY_VPA`, secrets, TTL, webhook URL  
- [x] Flutter merchant surface  

---

## Out of MVP (Phase 2+)

| Item | Reason |
| --- | --- |
| Licensed India PSP as primary settlement | Contradicts confirmed direction |
| Live Visa / Mastercard / RuPay acquiring | Needs partner; stubs only |
| Observer / SMS parse auto-match | Deferred; merchant confirm is MVP |
| GST API integration | Extension point only |
| Bank reconciliation import | Extension point only |
| Authorize.net / Cardinal / Autopay / mPOS | Phase 2+ |
| Claiming NPCI/PA certification | Never |

---

## Success criteria

1. Buyer opens checkout → QR/intent to **merchant VPA** → waiting state.  
2. Merchant confirms → buyer sees success; webhook fired (logged/testable).  
3. Second same-amount create **warns** unless `confirmDuplicate`.  
4. Long payment **times out** → `EXPIRED` with clear UX.  
5. Tally shows success / failed / total sales.  
6. Flutter merchant can confirm a pending payment.  
7. Card stub rails return “not enabled”; no PAN collected.

---

## Deferred (explicit)

- Bank alert observer companion  
- Live GST / reconciliation products  
- Hosted multi-tenant control plane  
- Production hardening (Postgres, Redis, HA)  
