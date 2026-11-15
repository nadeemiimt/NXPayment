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

# API — http://127.0.0.1:3847
cd apps/api && npm install && npm run dev

# Web — http://127.0.0.1:4321  (separate terminal)
cd apps/web && npm install && npm run dev
```

1. Open [http://127.0.0.1:4321/merchant/onboarding](http://127.0.0.1:4321/merchant/onboarding) → set VPA.  
2. Open [http://127.0.0.1:4321/checkout](http://127.0.0.1:4321/checkout) → create a payment → scan/open UPI.  
3. Open [http://127.0.0.1:4321/merchant/pending](http://127.0.0.1:4321/merchant/pending) → **Confirm**.  
4. Buyer page polls to `SUCCESS`; webhook delivery is logged (or POSTed if `WEBHOOK_URL` is set).

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

Covers GST math, bulk/retail profit math, storage config, report aggregates, display session happy path.

## API sketch

- `POST /api/payments` — create (`amountPaise`, optional `confirmDuplicate`, `idempotencyKey`, `shopId`)  
- `GET /api/payments/:id` — status  
- `POST /api/payments/:id/confirm` | `/reject`  
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
