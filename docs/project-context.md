# NXPayment — Project Context (durable constraints)

Use this file as the **source of truth** for product stance. Architecture and MVP docs must stay consistent with it.

---

## Product identity

**NXPayment** is software that helps merchants accept **UPI payments that settle directly into the merchant’s own bank/UPI account**, plus a clean path later to **optional card rails via third-party partners**. NXPayment is **not** a licensed India payment aggregator (PA) and does **not** hold customer funds.

---

## Hard constraints (confirmed)

| # | Constraint | Implication |
| --- | --- | --- |
| C1 | **No licensed India PSP as primary** | Do not route MVP UPI through Razorpay/Cashfree/PayU as the settlement path |
| C2 | **Direct-to-merchant funds** | Checkout targets the **merchant’s VPA / receiving account**; money never passes through NXPayment |
| C3 | **SaaS / install-per-customer** | Each merchant gets a **dedicated deploy** or **strong tenant isolation**, with their own VPA/secrets/config |
| C4 | **Simplify merchant onboarding** | Fewest steps to go live: VPA → branding → test payment → embed/checkout link |
| C5 | **Optional Visa / Mastercard later** | Keep a **provider adapter port**; card acquiring/regulatory burden stays with partners |
| C6 | **Honest compliance posture** | Market as **payment software / checkout tooling**, not as NPCI-certified PG or PA; no false settlement guarantees |
| C7 | **Phased extras** | Authorize.net, Cardinal, recurring, mPOS, phone pay are **Phase 2+** unless they fit the self-hosted model cleanly |

---

## Locked product decisions (2026-10-20)

| # | Decision | Detail |
| --- | --- | --- |
| L1 | **Clients: Flutter + Web** | Ship both. Web hosts SimpleCheckout + merchant admin; Flutter ships a real merchant confirm/tally surface (buyer may deep-link to web checkout). |
| L2 | **Confirmation = merchant Confirm + observers** | Manual **Confirm/Reject** remains authoritative backup. Optional auto-confirm from **Bank SMS & Gmail alerts** (not aggregator webhooks). Ambiguous matches → manual only. |
| L3 | **Concurrency / FIFO** | Default **single-slot FIFO**: at most one in-progress UPI payment unless override. Same-amount still returns `409` without `confirmDuplicate`. Timeouts → `EXPIRED`; circuit breaker on side-effects. |
| L4 | **Status + tally / reports** | Payment status API + tally-style totals: success count, failed, total sales. Design extension points for GST API + reconciliation later — **do not integrate GST in MVP**. |
| L5 | **Verification stance** | **Payment Verification = Bank SMS & Gmail Alerts parsed in real time.** Not Razorpay/Cashfree-style proprietary webhooks as source of truth. |
| L6 | **Risk + alerts (NX unique)** | Risk scores on payments + merchant alert center (high-risk, expired, auto-confirm outcomes). |

---

## What “fallback” means here

**Not** a licensed PSP. Fallback is:

- a **second merchant VPA / receiving account**, and/or  
- a **secondary confirmation path** (merchant confirm remains the primary MVP authority).

---

## What cards cannot do without a partner

Online Visa/Mastercard/RuPay **acquiring** requires a bank/acquirer/PSP partner. NXPayment’s job is to **plug them in** via adapters and unify checkout UX—not to become the acquirer. MVP ships **stubs only**.

---

## Related docs

- [`architecture-plan.md`](./architecture-plan.md) — system design for this model  
- [`mvp-scope.md`](./mvp-scope.md) — first shippable slice  
- [`gap-analysis.md`](./gap-analysis.md) — YouPI-PG reference + revised stance  
- [`youpi-parity.md`](./youpi-parity.md) — full YouPI comparison + build phases  
- [`auto-confirm.md`](./auto-confirm.md) — SMS/Gmail auto-confirm how-to  

