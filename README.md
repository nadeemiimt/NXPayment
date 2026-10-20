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

## Requirements

- **Node.js 20+** (API uses Fastify 5)

## Quick start (local)

```bash
cp deploy/.env.example .env

# from repo root (workspaces)
npm install

# API — http://127.0.0.1:3847
npm run dev:api

# Web — http://127.0.0.1:4321  (separate terminal)
npm run dev:web
```

### Integration tests (temp SQLite, no real money)

Requires **Node.js 20+** (Fastify 5). If nested tests show `cancelledByParent` / “did not finish before its parent”, you are almost certainly on Node 19 or older (`node -v`).

After switching Node major versions (e.g. 24 → 20), rebuild the native SQLite addon so `NODE_MODULE_VERSION` matches:

```bash
node -v   # must be v20+
npm rebuild better-sqlite3
npm run test:integration
```

### Real-money local testing

See **[docs/local-real-money-testing.md](docs/local-real-money-testing.md)** — ₹1 live UPI to your own VPA, merchant Confirm, tally, and refund limits.

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

## API sketch

- `POST /api/payments` — create (`amountPaise`, optional `confirmDuplicate`, `idempotencyKey`)  
- `GET /api/payments/:id` — status  
- `POST /api/payments/:id/confirm` | `/reject`  
- `GET /api/reports/tally` — success / failed / sales  
- `GET /api/reports/gst-export` — **stub**  
- `POST /api/reports/reconciliation` — **stub**  
- Card rails `visa_partner` / `mastercard_partner` — **stubs only**

Amounts are integer **paise**. Outbound webhooks are HMAC-SHA256 signed with `WEBHOOK_SECRET` (`X-NXPayment-Signature`).

## Compliance copy

Market as payment **software / checkout tooling**. Merchants use **their** UPI accounts and remain responsible for bank reconciliation.
