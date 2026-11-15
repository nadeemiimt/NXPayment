# NXPayment

Direct-to-merchant **UPI checkout software** — buyers pay the merchant’s own VPA; NXPayment tracks status, merchant Confirm, webhooks, and tally. **Not** a licensed India PSP; funds never sit with NXPayment.

## What’s in this repo

| Path | Role |
| --- | --- |
| `apps/api` | Fastify + SQLite payment API |
| `apps/web` | Next.js SimpleCheckout + merchant admin |
| `apps/mobile` | Flutter merchant confirm + tally |
| `packages/shared` | Shared money / UPI helpers |
| `deploy/` | Docker Compose + Dockerfiles + `.env.example` |

Product docs (Project store): `docs/project-context.md`, `architecture-plan.md`, `mvp-scope.md`.

## Quick start (local)

```bash
cp deploy/.env.example .env
npm install

# Both API (:3847) + web (:4321)
npm run dev:up

# Or separately:
npm run dev:api   # http://127.0.0.1:3847
npm run dev:web   # http://127.0.0.1:4321
```

1. Open [http://127.0.0.1:4321/merchant/onboarding](http://127.0.0.1:4321/merchant/onboarding) → set VPA.  
2. Open [http://127.0.0.1:4321/checkout](http://127.0.0.1:4321/checkout) → create a payment → scan/open UPI.  
3. Open [http://127.0.0.1:4321/merchant/pending](http://127.0.0.1:4321/merchant/pending) → **Confirm**.  
4. Buyer page polls to `SUCCESS`; webhook delivery is logged (or POSTed if `WEBHOOK_URL` is set).

### Playwright E2E

Hermetic Chromium tests against temp SQLite (no Gmail / WhatsApp / LLM secrets). Ports: API `3847`, web `4321`.

```bash
npm install
npx playwright install chromium   # or: npm run test:e2e:install

# Local (starts API + Next via Playwright webServer; uses next dev when CI unset)
npm run test:e2e

# CI-like (build + production start)
npm run build --workspace=@nxpayment/web
CI=true npm run test:e2e
```

Coverage: merchant onboarding/home, checkout QR wait, confirm/reject pending, inventory quick-add, reports, loyalty, storage, display kiosk. `/merchant/tokens` is soft-skipped when the route is absent.

GitHub Actions: `.github/workflows/e2e.yml` (Node 20, install, build web, run Playwright, upload report on failure).

### Same-amount guard

Creating a second in-progress payment for the **same paise amount** returns `409` with `requireConfirmDuplicate`. The checkout UI warns; pass `confirmDuplicate: true` to proceed.

### Timeouts

`PAYMENT_TTL_MS` (default 5 minutes) expires `ACTIVE`/`PROCESSING` sessions → `EXPIRED`.

### Flutter merchant

```bash
cd apps/mobile
flutter pub get
flutter run
```

Enter the API base URL on first launch (use your LAN IP on a device).

## Docker (one merchant install)

```bash
cp deploy/.env.example .env
# edit PRIMARY_VPA, secrets, WEBHOOK_URL
docker compose -f deploy/docker-compose.yml up --build
```

- API: port `3847`  
- Web: port `4321`

## Local shop SaaS (Slice 3 — AI + payment)

Stacked on Slice 2. Heuristic assist only unless `INSIGHTS_LLM_KEY` + `INSIGHTS_LLM_URL` are set (never fake LLM).

### Smart confirm assist

- `GET /api/payments/pending/assist` scores open payments vs observed bank credits (amount, time window, UTR, same-amount collisions).
- `POST /api/payments/observed-credits` logs a manual/SMS-style credit; Pending UI shows confidence + one-tap Confirm.
- Optional LLM path shares insights keys — without a real provider call, UI stays heuristic-only.

### Margin / loss guard

- Shop settings: `minMarginPercent`, `underMarginMode` (`warn` | `block`) on `/merchant/shops`.
- Quick-sale blocks sell &lt; cost; under min margin returns `409 margin_guard` (warn) or `400` (block). Inventory UI prompts to accept warn.
- Pharmacy insights flag SKUs within 60 days of expiry.

### Loyalty next-best offer

- One RFM / purchase-gap offer per enrolled customer (`discount_paise` or `points_bonus`).
- Shown on `/merchant/loyalty` and checkout phone lookup; **Accept** applies redeem (points or discount).

### Tests (Slice 3)

```bash
cd apps/api && npm test
```

Adds confirm-scorer, margin math, and next-best offer generation coverage.

## Local shop SaaS (Slice 2 — malls / weight / loyalty)

Stacked on Slice 1. Targets malls, pharmacies, and retail chains plus loose weight sales.

### Sell by weight

- Inventory `sale_mode`: `unit` | `weight` with units kg/g/L/ml (stock in base g/ml).
- Quick-sale: enter weight → amount = weight × rate; stock deducted; receipt shows weight + rate.
- Profit math uses bulk cost in the same display unit as the shelf rate.

### Malls / multi-outlet

- Shop types: `retail`, `restaurant`, `pharmacy`, `mall_kiosk`, `supermarket`.
- Reports: **Active shop** or **All shops (org)** roll-up.
- Staff role stub: `owner` | `cashier` (cashier sells/confirms; cannot edit storage secrets / manage shops).
- Inventory pagination + search; **Quick sale** → UPI payment.

### Secondary storage

- `local_replica` / hybrid: real periodic WAL-aware SQLite file backup to secondary path.
- Online Postgres: encrypted DSN + status (`configured_sqlite_primary`); SQLite remains write primary. Conflict policy documented in Storage UI/API.

### Loyalty

- `/merchant/loyalty` — enroll by phone, points per ₹, tiers, stamp visits, nudge suggestions (WhatsApp stub).
- At quick-sale optionally attach `customerId` + `pointsToRedeem`.

## Local shop SaaS (Slice 1)

Plan pillars: storage modes, counter display, GST reports, insights, multi-shop inventory (retail / restaurant / pharmacy), bulk vs retail profit math. Direct-to-merchant UPI is unchanged.

### Storage modes (`/merchant/storage`)

| Mode | Behaviour |
| --- | --- |
| `local_only` | Existing SQLite WAL primary |
| `local_replica` | Primary + optional secondary SQLite file path (periodic / manual copy) |
| `hybrid` / `online_primary` | Config + status wired; **Postgres online primary driver comes in Slice 2** (clear stub note in API/UI) |

Online connection strings are encrypted at rest; never commit secrets. `POST /api/merchant/storage/backup` copies the primary DB to the secondary path.

### Counter / display kiosk

1. Merchant home → **Generate display code**.  
2. Open `/display/<CODE>` on a cheap phone/tablet (browser kiosk / full-screen).  
3. Display polls every 1s for the current open payment — large ₹ amount, brand name, live UPI QR, waiting/paid/expired.

Hardware note: any browser that can show a page works for Slice 1; ESP32/e-ink guides are later.

### Reports & GST (`/merchant/reports`)

- Configurable GST % (CGST/SGST or IGST), inclusive vs exclusive; tax snapshotted on **Confirm**.  
- Daily / monthly / India financial year (Apr–Mar default).  
- Charts: day-of-week sales, hour-of-day sessions (+ success trend).  
- CSV export; GSTR-shaped JSON stub at `GET /api/reports/gst-export` (no live GSTN).

### Insights (`/merchant/insights`)

Deterministic pattern engine (peak hours, slow periods, same-amount collisions, timeout rate, weekday vs weekend) plus focus / deprioritize recommendations. Optional `INSIGHTS_LLM_KEY` / `INSIGHTS_LLM_URL` — without a completed provider call, UI stays heuristic-only (never faked as LLM). Aggregate stats only; no VPA/tokens to models.

### Shops, inventory, pharmacy & pricing

- `/merchant/shops` — multi-outlet + locations; shop switcher in merchant nav; optional per-shop VPA override stub.  
- Business types: `retail` | `restaurant` | `pharmacy`. Pharmacy adds optional batch / expiry / pack size.  
- `/merchant/inventory` — quick-add requires **bulk qty + bulk cost + unit sell price**. Derived cost/unit, profit/unit, and “profit if sell N” (editable N). Example: 1000 pcs @ ₹3500 cost, sell ₹4 → ₹0.50/unit; sell 100 → ₹50.

### Thermal receipts

- Settings: `/merchant/receipts` — paper width **58mm / 80mm**, header, footer, thank-you line.  
- After **Confirm**, merchant is taken to `/merchant/receipts/<paymentId>` (also linked from Payments).  
- Browser **Print** uses receipt-width CSS; **Download ESC/POS** for raw `.bin`; local USB bridge print is a **stub** (`POST …/receipt/bridge-print`).  
- Content: shop name, date/time, amount/note, UPI VPA, GST breakdown when snapshotted, thank-you. UTR when available later.

### Tests

Node **20+** required (`scripts/require-node20.js`).

```bash
cd apps/api && npm test
```

Covers GST math, bulk/retail profit math, storage config, report aggregates, display session happy path, confirm scorer, margin guard, loyalty offers.

## API sketch

- `POST /api/payments` — create (`amountPaise`, optional `confirmDuplicate`, `idempotencyKey`, `shopId`)  
- `GET /api/payments/:id` — status  
- `GET /api/payments/pending/assist` — confirm confidence scores  
- `POST /api/payments/observed-credits` — log bank credit for assist  
- `POST /api/payments/:id/confirm` | `/reject`  
- `GET/POST …/loyalty/customers/:id/next-offer` | `accept-offer`  
- `GET /api/reports/tally` — success / failed / sales  
- `GET /api/merchant/reports` — period totals + charts  
- `GET /api/merchant/reports/csv` — CSV export  
- `GET /api/reports/gst-export` — GSTR-shaped stub (not live GSTN)  
- `GET /api/merchant/storage` | `PUT` | `POST …/backup`  
- `GET /api/display/:code` — kiosk state  
- `GET /api/merchant/insights`  
- `GET/PUT /api/merchant/receipt-settings` · `GET …/payments/:id/receipt` · `…/receipt.escpos`  
- Shops / locations / inventory CRUD under `/api/merchant/…`  
- `POST /api/reports/reconciliation` — **stub**  
- Card rails `visa_partner` / `mastercard_partner` — **stubs only**

Amounts are integer **paise**. Outbound webhooks are HMAC-SHA256 signed with `WEBHOOK_SECRET` (`X-NXPayment-Signature`).

## Compliance copy

Market as payment **software / checkout tooling**. Merchants use **their** UPI accounts and remain responsible for bank reconciliation.
