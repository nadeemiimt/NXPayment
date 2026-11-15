# NXPayment — Local shop / restaurant SaaS plan

**Audience:** kirana, cafés, restaurants, **pharmacies**, **retail chains**, and **malls / multi-outlet** — packaged per merchant or per org, money still settles **direct to merchant UPI/VPA** (no licensed PA in the primary path).

**Status:** Slice 1–3 merged. **Slice 4** — simple provider hub + agent commerce (UPI default; agents = one toggle + one key).

---

## Product stance (unchanged)

- Self-hosted / per-merchant SaaS: funds go to the shop’s own bank/UPI.
- Manual Confirm always available; SMS / Gmail (Yahoo later) auto-confirm optional.
- Cards = pluggable partner adapters later; not blocking this SaaS slice.

---

## Pillars

### 1. Data residency: local primary + secondary / online

| Mode | Primary | Secondary | Use |
|------|---------|-----------|-----|
| **Local only** | SQLite (existing WAL) on shop device / desktop | Optional second SQLite path or USB/folder backup | Offline-first shops |
| **Local + replica** | SQLite primary | Async replica (file copy / WAL ship / secondary SQLite) | Backup & disaster recovery |
| **Hybrid** | Local SQLite primary | Online Postgres (or hosted SQLite sync) as secondary | Multi-device + phone backup |
| **Online primary** | Hosted Postgres | Optional local cache | Multi-outlet / cloud admin |

**Rules**

- Merchant chooses mode in **Settings → Storage** (`/merchant/storage`).
- Secrets stay encrypted at rest; never in git.
- Writes always hit **primary**; secondary is async (eventual consistency). Failures on secondary must not block checkout.
- Schema versioning + migrate-on-boot for both engines.
- Export/import JSON or SQL dump for shop migration.

### 2. Counter / cheap display (QR + amount)

**Goal:** Show pending payment amount + UPI QR on a low-cost screen (old phone, Fire tablet, ₹2–5k Android panel, ESP32/browser kiosk).

- Full-bleed **Display** route: `/display/:token` or `/merchant/display` (kiosk, no chrome).
- Large amount (₹), merchant name, live QR for current open payment, status pulse (waiting / paid / expired).
- Pairing: short code or QR from merchant phone → display joins same shop session via SSE/poll.
- Deep-link buttons optional on phone; display stays QR-first (no clutter).
- Hardware note (docs only in Slice 1): browser kiosk mode; later ESP32/e-ink if demanded.

### 3. GST + sales reports + graphs

- Configurable GST profile per shop: CGST/SGST or IGST %, HSN optional, inclusive vs exclusive.
- Line / payment-level tax snapshot at settle time (immutable for that txn).
- Reports:
  - **Daily** — today / pick date
  - **Monthly** — calendar month
  - **Financial year** — Apr–Mar (India default), configurable start month
  - Totals: sales, success, failed, refunds (stub), GST collected, average ticket
- Charts: day-of-week, hour-of-day heatmap, payment method mix, success rate trend.
- CSV export; GST JSON export shape ready for future GSTR API (no live GSTN API in Slice 1).

### 4. Inventory, locations, multi-shop

- **Business types:** retail, restaurant/café, **pharmacy** (and generic shop) — same install, type drives labels/optional fields.
- **Pharmacy:** optional batch no., expiry date, pack size on items (chemist-friendly; keep add-flow fast).
- **Multi-shop:** one merchant account → many outlets; shop switcher; payments/inventory/reports filter by active shop.
- **Locations:** per-shop stock places (kitchen, shelf, godown, pharmacy counter); CRUD.
- **Inventory:** quick-add, list, update, delete (name, optional SKU, qty on hand, location, shop).
- **Bulk vs retail + profit:**
  - Bulk: `bulk_qty` + `bulk_cost` (e.g. 1000 pcs @ ₹3500).
  - Retail: sell price per unit (e.g. ₹4).
  - Cost/unit = bulk_cost ÷ bulk_qty; profit/unit = sell − cost/unit; profit for N sold = N × profit/unit (e.g. 100 sold → ₹50).
  - Show cost/unit, profit/unit, and projected profit for N on add/edit and list.
- Slice 1: SQLite + Web CRUD; optional per-shop VPA override stub. Flutter parity later.

### 5. Thermal receipts

- Print receipt after confirm (and from sale detail) for **58mm / 80mm** ESC/POS thermal printers.
- Slice 1: printable receipt view + CSS `@media print` sized for thermal width; merchant settings for paper size and header/footer.
- Optional later: raw ESC/POS via local agent/USB bridge for silent print.
- Content: shop name, datetime, amount/items, UTR if present, GST lines, footer.

### 6. Sales-pattern insights + GenAI recommendations

- Deterministic **pattern engine** first (always works offline): peak hours, slow SKUs/amounts, same-amount collision rate, decline/timeout rate, weekday vs weekend.
- **GenAI layer** (optional): when `INSIGHTS_LLM_KEY` (or provider) set, summarize patterns into 3–5 shop actions (“focus dinner rush QR display”, “avoid same-amount doubles at lunch”).
- Without key: heuristic recommendations only (no fake LLM).
- UI: `/merchant/insights` — cards + “what to focus / what to deprioritize”.
- Never send secrets or full PANs/VPAs to the model; aggregate stats only.

---

### Inventory & multi-shop (Slice 1 add-on)

- **Multi-shop:** one merchant install → many outlets; shop switcher in merchant UI; payments / inventory / reports / insights filter by active shop when set.
- **Locations:** per-shop stock places (kitchen, shelf, storefront/godown); CRUD under shops or inventory.
- **Inventory:** quick-add, list, update, delete (name; optional SKU & unit price; qty; location; shop). Soft-delete or hard-delete OK; cascade carefully.
- **VPA:** keep direct-to-merchant UPI. Slice 1 allows shop name + optional per-shop VPA override stub (fallback to merchant primary VPA until wired at create-payment).
- Ship in the same Slice 1 PR when feasible; do not block storage / display / reports / insights pillars.

### Pharmacy & bulk/retail pricing (Slice 1 add-on)

- **Business types:** shop type includes `retail`, `restaurant`, and `pharmacy` (local chemists). Pharmacy UX stays simple — optional **batch / expiry** and **pack size** on inventory items; no full drug-schedule complexity in Slice 1.
- **Bulk vs retail pricing (required on add/edit):**
  - `bulk_qty` + `bulk_cost_paise` (e.g. 1000 biscuits cost ₹3500)
  - `unit_price_paise` retail sell price per unit (e.g. ₹4)
  - Derived: `cost_per_unit = bulk_cost / bulk_qty`; `profit_per_unit = unit_price − cost_per_unit`; projected profit for N sold = `N × profit_per_unit`
  - Merchant UI shows cost/unit, profit/unit, and “profit if sell N” (editable N) on add/edit and list rows.
- Keep direct-to-merchant UPI; pricing is inventory/merchant analytics only — not a payment rail change.

### Thermal receipts (Slice 1 add-on)

- After **Confirm** (and from payment/sale detail): print a receipt for common **58mm / 80mm** ESC/POS thermal printers.
- **Web:** browser print CSS sized for receipt width + optional raw ESC/POS download; local print-bridge is a stub if not wired. Minimum: printable receipt page/modal that works with OS “Print” to a USB/network thermal driver.
- **Content:** shop name, date/time, items or amount, UPI/UTR if present, GST breakdown when configured, thank-you line.
- **Merchant setting:** paper width 58/80mm, custom header/footer text.
- Does not change direct-to-merchant UPI settlement.

### Loyalty (Slice 2 add-on)

- Identify / enroll customers by phone (optional name); track purchase amount, frequency, recency.
- Configurable rules per shop/org: points per ₹ spent, tier thresholds (bronze/silver/gold), or stamp-style visit rewards.
- Insights: nudge high spenders going quiet, frequent buyers — reuse pattern heuristics.
- At sale/checkout: look up customer, show points/tier, apply reward (discount paise or redeem points) when configured.
- Merchant UI: `/merchant/loyalty` — customers, tiers, rules, encourage actions (manual note / WhatsApp stub).
- Loyalty is merchant-side CRM only — UPI settlement stays direct-to-merchant.

## Architecture (delta on current stack)

```
apps/api
  storage/          # primary + secondary drivers (sqlite, postgres stub)
  reports/          # aggregates, GST math, FY windows
  insights/         # pattern engine + optional LLM adapter
  display/          # session + SSE for counter screen

apps/web
  /merchant/storage
  /merchant/reports   (+ charts)
  /merchant/insights
  /display/[code]     # kiosk
```

Keep Fastify + Next.js + Flutter path; Flutter later mirrors reports + display pairing.

---

## Execution slices

### Slice 1 (now) — shop SaaS foundation

1. Plan doc (this file) + storage settings API/UI (local primary, optional secondary path, online flag stub).
2. Kiosk **Display** page driven by current/open payment (SSE or 1s poll).
3. **Reports** page: daily / monthly / FY + simple charts + GST % config + CSV.
4. **Insights** page: pattern engine + mock/heuristic GenAI recommendations; optional LLM if env key present.
5. **Shops / locations / inventory** CRUD + shop switcher (user add-on 2026-11-15).
6. README + merchant docs for storage + display hardware.
7. PR against `main` on `nadeemiimt/NXPayment`.

### Slice 2 — mall / retail scale + loose weight + secondary storage

**Sell by weight (loose items)**
- Item `sale_mode`: `unit` | `weight` (loose).
- Weight units: kg, g, L, ml (configurable); weigh at sale → amount = weight × price_per_unit.
- Bulk cost + retail price_per_kg (or per g) with same profit math as unit items.
- POS/checkout: enter weight (manual or scale stub); receipt shows weight + rate.
- Inventory qty tracked in base unit (e.g. grams).

**Malls / multi-outlet retail**
- Org → many shops (mall floors, pharmacy branches, retail counters).
- Shop types: retail, restaurant, pharmacy, mall_kiosk, supermarket.
- Active shop switcher; reports/insights filter by shop or org roll-up.
- Optional per-shop VPA; staff role stub (owner / cashier) for mall cashiers.
- Higher-volume-friendly list pagination and quick-sale from inventory.

**Loyalty (purchase-pattern rewards)**
- Enroll customers (phone ± name); track spend, frequency, recency.
- Configurable rules: points per ₹, tiers, visit stamps; earn on confirm, redeem at sale.
- Pattern nudges: high spenders going quiet, frequent buyers — encourage more visits.
- UI `/merchant/loyalty`; checkout lookup shows tier/points; WhatsApp nudge stub optional.
- Merchant-side CRM only — does not change direct UPI settlement.

**Storage (from original Slice 2)**
- Real secondary SQLite backup job (periodic copy / WAL-aware).
- Online Postgres primary: config + driver stub or thin real path if feasible; encrypted DSN.
- Conflict / failover notes in README.

### Slice 3 — AI + payment differentiators

- Smart confirm assist, margin/loss guard, loyalty next-best offer (merged).

### Slice 4 — next-gen provider hub + agent commerce (keep it simple)

**Spirit:** next-gen under the hood; **simple product** on the surface — kirana/pharmacy takes payment in &lt;3 taps.

1. **Providers (minimal UI):** UPI on by default. Cards = one “Coming soon” stub. At most primary + optional backup (Advanced only). No maze of rails.
2. **Agent commerce API** — catalog / quote / pay / status + OpenAPI; merchant sees only: “Allow shopping agents” + one API key (copy once). Folded into Setup — no new nav.
3. **Advanced** collapsed — registry + stubs in code; hide from default nav.
4. **SimpleCheckout unchanged** as the human path. Direct UPI remains primary; no licensed PA required.

**Product rule:** every new feature ships with a default; configuration is optional.

### Slice 5 — display hardware + multi-device

- Display pairing codes, multi-display, Flutter counter mode.
- Optional ESP32/webview guide.

### Slice 6 — GSTN / GSTR-ready export + reconciliation

- Structured GSTR-1-ish export; reconciliation vs bank credits.

### Slice 7 — richer GenAI + alerts

- Scheduled daily insight push (WhatsApp/email); anomaly alerts.

---

## Non-goals for Slice 1

- Live GSTN API filing.
- Full multi-tenant cloud control plane (still one merchant DB per install; “SaaS” = packaged product per shop).
- Replacing manual confirm / UPI direct settlement.
- Real card acquiring.

---

## Success criteria (Slice 1)

- Merchant can set storage mode and see primary/secondary status.
- Cheap tablet browser can open Display URL and show amount + QR for an open payment.
- Reports show daily/monthly/FY totals with GST and at least two charts.
- Insights show actionable focus / avoid recommendations without requiring an LLM key.
- No secrets committed; integration tests cover GST math + report aggregates + display session happy path.


## Success criteria (Slice 2)

- Loose/weight items sell with rate × weight, stock deducted in base units, receipts show weight + rate.
- Shop types include mall_kiosk and supermarket; reports can roll up all shops or one; cashier role stub cannot edit storage secrets.
- Inventory lists paginate; quick-sale from inventory creates a UPI payment.
- `local_replica` runs a real periodic secondary SQLite backup; online Postgres has encrypted DSN + status (thin path or documented stub) and conflict policy in README.

## Success criteria (Slice 4)

- Provider registry selects `upi_direct` by default; card / Authorize.net stubs return clear “not configured”.
- Setup shows ≤3 payment toggles (UPI / Cards / Other under Advanced); no new merchant nav items.
- Agent API: catalog, quote, create, status (+ optional confirm) with Bearer key; OpenAPI at `/api/agent/v1/openapi.json`.
- Agent keys hashed at rest; plaintext shown once; never committed.
- Tests cover registry selection + agent create/status happy path.
