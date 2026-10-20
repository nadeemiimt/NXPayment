# NXPayment — Architecture Plan (self-hosted direct settlement)

**Status:** Active — MVP coding authorized  
**Stance:** [`project-context.md`](./project-context.md)  
**Reference:** YouPI-PG patterns ([gap analysis](./gap-analysis.md)); MVP checklist ([mvp-scope.md](./mvp-scope.md))

---

## 1. Product model (confirmed)

NXPayment is a **per-merchant installable SaaS** (or strongly isolated tenancy) that:

1. Shows buyers a **SimpleCheckout** (UPI Intent + QR) paying **to that merchant’s own VPA**.
2. Tracks **order/payment state**; **merchant Confirm** is the MVP confirmation authority (buyer sees live waiting/timeout UX).
3. Keeps a **provider adapter port** so **Visa / Mastercard** can be added for cards **without rewriting core** — partners own acquiring/regulation (**stubs only in MVP**).
4. Does **not** sit in the money path and does **not** claim to be a licensed PA/PG.

**Fallback** = second merchant VPA/account — **not** a licensed India PSP.

---

## 2. Recommended stack

| Layer | Choice | Why |
| --- | --- | --- |
| **Mobile** | **Flutter** (locked) | iOS+Android merchant ops (pending confirm + tally); optional thin buyer → web checkout |
| **Web** | **Next.js + TypeScript + Tailwind + shadcn/ui** | Hosted SimpleCheckout, onboarding, admin, tally |
| **Backend** | **Node.js + TypeScript (Fastify)** | Lean per-tenant service |
| **DB (per tenant)** | **SQLite (MVP install)** | Simplest single-merchant Docker |
| **Packaging** | **Docker Compose per merchant** | VPA, secrets, branding as env/volume |
| **Realtime** | Poll or SSE for checkout status | Buyer UX while waiting for merchant confirm |
| **Cards (Phase 2)** | Adapter stubs only in MVP | No live acquiring in v1 |

**Avoid for MVP core:** routing UPI through Razorpay/Cashfree as primary settlement; building a central “pool” VPA that NXPayment controls.

---

## 3. Tenant / install model

### 3.1 Preferred for launch: dedicated deploy per merchant

```text
Merchant A                          Merchant B
┌─────────────────────────┐        ┌─────────────────────────┐
│ Docker Compose          │        │ Docker Compose          │
│  api + web + db         │        │  api + web + db         │
│  env: VPA_A, secrets_A  │        │  env: VPA_B, secrets_B  │
│  Domain: pay.a.com      │        │  Domain: pay.b.com      │
└─────────────────────────┘        └─────────────────────────┘
```

| Concern | Approach |
| --- | --- |
| **Secrets** | Per-install: webhook HMAC, admin token — never shared across tenants |
| **VPA config** | Primary VPA + optional secondary VPA; display name (`pn=`) |
| **Branding** | Logo URL, accent color, checkout title — local config |
| **Data isolation** | Physical isolation by default (separate container/volume) |

---

## 4. System architecture

```text
Buyer (Browser)              Merchant (Web / Flutter)
        │                              │
        ▼                              ▼
┌─────────────────── Tenant instance ───────────────────┐
│  SimpleCheckout          Merchant admin / till         │
│    UPI QR + Intent → merchant VPA                      │
│                         │                              │
│                         ▼                              │
│  Payment API — state machine, paise, idempotency       │
│         │                                              │
│         ▼                                              │
│  Merchant Confirm (+ circuit breaker / TTL expire)     │
│         │                                              │
│         ▼                                              │
│  Webhooks (HMAC) → merchant storefront                 │
│  Reports / tally → success, failed, sales              │
│  ProviderPort (stubs) ──► Visa/MC partner (Phase 2)    │
└─────────────────────────────────────────────────────────┘
```

### Core flows

1. **Create payment** → `INITIATED` → `ACTIVE`; if same amount already in-progress → **409 + warn** unless `confirmDuplicate: true`.
2. **Checkout** shows QR / deep link to **merchant VPA**.
3. **Buyer pays** on any UPI app (direct to merchant bank) and waits with live status.
4. **Merchant Confirm / Reject** → `PROCESSING` → `SUCCESS` / `FAILED`; long wait → `EXPIRED` via TTL job.
5. **Webhook** on terminal states; tally aggregates success/failed/sales.

---

## 5. Payment state machine (MVP)

```text
INITIATED → ACTIVE → PROCESSING → SUCCESS
                │         │
                ├→ EXPIRED ┤
                ├→ CANCELLED
                └→ FAILED
```

**Money:** integer **paise** only; currency `INR` for MVP.

**TTL:** payments left in `ACTIVE` / `PROCESSING` past `PAYMENT_TTL_MS` become `EXPIRED`.

**Circuit breaker:** wraps confirmation side-effects (webhook dispatch / match hooks). Opens after repeated failures; payments still transition but outbound effects are paused until half-open probe succeeds.

---

## 6. Confirmation strategy (locked for MVP)

| Rank | Strategy | MVP |
| --- | --- | --- |
| **1 (locked)** | **Merchant Confirm / Reject** per payment | **Ship** — primary authority |
| 2 | Observer assist (SMS/push parse) | Deferred |
| 3 | Bank statement / CSV import | Deferred (recon extension point) |
| — | Buyer “I paid” alone | Never sole authority |

Document clearly: *software-assisted verification; merchant remains responsible for reconciling bank records.*

---

## 7. Concurrency policy (locked)

- Concurrent payments allowed for same merchant (different amounts freely).
- **Same amount already in-progress** (`ACTIVE` or `PROCESSING`): create returns conflict unless client passes **`confirmDuplicate: true`** after UI warning.
- Different merchants = different installs (no shared in-progress set).
- Timeouts expire stale sessions; circuit breaker protects webhook/side-effect storms.

---

## 8. Provider port (cards later — stubs only)

```ts
interface PaymentRail {
  id: string; // 'upi_direct' | 'visa_partner' | 'mastercard_partner'
  createCheckout(session: PaymentSession): Promise<CheckoutPresentation>;
  handleWebhook?(raw: unknown): Promise<NormalizedStatus>;
  healthCheck(): Promise<'up' | 'degraded' | 'down'>;
}
```

| Rail | MVP | Notes |
| --- | --- | --- |
| `upi_direct` | **Implement** | Merchant VPA QR/intent + merchant confirm |
| `visa_partner` / `mc_partner` | **Stub** | Feature-flagged off; “not enabled” |

---

## 9. Onboarding UX

1. Enter primary UPI VPA + display name.  
2. Optional secondary VPA + branding.  
3. Test payment → merchant Confirm → SUCCESS.  
4. Copy checkout link / API key / webhook secret.

Admin: pending confirms, payment list, tally dashboard, settings.

---

## 10. Reports / tally

MVP endpoints return for a date range:

- `successCount`, `failedCount`, `expiredCount`, `cancelledCount`
- `totalSalesPaise` (sum of SUCCESS amounts)
- `paymentCount`

**Extension points (stub only):** GST export adapter interface; reconciliation import interface — no GST integration in MVP.

---

## 11. Module map & folder structure

```text
nxpayment/
├── apps/
│   ├── api/           # Fastify TS
│   ├── web/           # Next.js checkout + admin
│   └── mobile/        # Flutter merchant
├── packages/
│   └── shared/        # contracts, money helpers, upi-uri
├── deploy/
│   ├── docker-compose.yml
│   └── .env.example
└── README.md
```

---

## 12. Risks (must stay visible)

| Risk | Mitigation |
| --- | --- |
| Compliance / wording | Sell as software; merchant’s UPI accounts |
| Mis-attribution (same amount) | Warn + confirmDuplicate; merchant Confirm is authority |
| Long hanging sessions | Payment TTL → EXPIRED |
| Webhook storms / outages | Circuit breaker around outbound side-effects |
| Cards without partner | Stubs only; never collect PAN |

---

## 13. Resolved decisions

1. **Flutter + Web** — both ship.  
2. **v1 confirmation:** merchant Confirm (manual).  
3. **Deploy:** Docker-per-merchant (SQLite).  
4. **Concurrency:** allow concurrent; same-amount warn + confirmDuplicate; timeouts + circuit breaker.  
5. **Reports:** tally now; GST/recon stubs only.

---

## 14. Build order

1. API + state machine + merchant confirm + expire job + webhooks + tally.  
2. SimpleCheckout + merchant admin web.  
3. Flutter merchant confirm + tally.  
4. Card adapter stubs + docker-compose.
