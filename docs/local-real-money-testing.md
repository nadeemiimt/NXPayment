# Local real-money testing (direct-to-merchant VPA)

This guide is for testing NXPayment on your Mac with a **real UPI ID**. NXPayment does **not** hold funds and is **not** a bank/PSP sandbox — when you pay from a phone UPI app, your bank actually debits you and credits the merchant VPA.

## What each kind of test proves

| Kind | Proves | Does **not** prove |
| --- | --- | --- |
| **`npm run test:integration`** | API state machine: create → confirm/reject/expire, 409 same-amount guard, idempotency, tally, webhook skip/HMAC against a temp SQLite DB | That your bank, UPI app, or VPA works |
| **Real money (this doc)** | End-to-end with a live VPA: UPI intent opens, money moves, merchant Confirm flips buyer to SUCCESS, tally matches what you saw | Automated refunds, card rails, multi-merchant scale |

## Prerequisites

- Repo at `/Users/mohdnadeem/Documents/NXPayment` (or your clone)
- **Node.js 20+** (Fastify 5; Node 19 will fail to load the API)
- API + Web running locally (Docker Compose **or** `npm run dev`)
- Merchant **primary VPA** set to **your real UPI ID** (the VPA that should receive funds)
- A phone with a UPI app logged into an account **you control**

## Safety

- Start with **₹1** (`amountPaise: 100`) — smallest practical live amount.
- Only use money and VPAs **you control**.
- This is **not** a sandbox: expect a **real bank debit** and a credit to the merchant VPA.
- Do not test with customer money or someone else’s VPA.
- Keep `PAYMENT_TTL_MS` short enough that abandoned checkouts expire (default 5 minutes).

## Steps

### 1) Start servers

**Option A — Docker**

```bash
cd /Users/mohdnadeem/Documents/NXPayment
cp deploy/.env.example .env
# Set PRIMARY_VPA to your real UPI ID, keep secrets local
docker compose -f deploy/docker-compose.yml up --build
```

- API: http://127.0.0.1:3847  
- Web: http://127.0.0.1:4321  

**Option B — Dev processes**

```bash
cd /Users/mohdnadeem/Documents/NXPayment
cp deploy/.env.example .env
# edit PRIMARY_VPA=your@upi

# terminal 1
npm install
npm run dev:api

# terminal 2
npm run dev:web
```

### 2) Onboard VPA

1. Open http://127.0.0.1:4321/merchant/onboarding  
2. Set **primary VPA** to your real UPI ID and save display name.  
3. Confirm http://127.0.0.1:3847/api/merchant/config shows that VPA.

### 3) Create checkout (₹1)

1. Open http://127.0.0.1:4321/checkout  
2. Create a payment for **₹1** (100 paise).  
3. You should see a waiting / in-progress state and a UPI link or QR (`upi://pay?...pa=<your-vpa>...`).

### 4) Pay from phone

1. Open the UPI intent on your phone (scan QR or open the link on the same LAN / via tunnel if needed).  
2. Complete the **₹1** payment in your UPI app.  
3. Check bank SMS / UPI app: debit from payer, credit toward the merchant VPA.  
4. NXPayment still shows **waiting** until a human confirms — by design for this MVP.

### 5) Merchant Confirm → SUCCESS

1. Open http://127.0.0.1:4321/merchant/pending (or the Flutter merchant app pointed at your API).  
2. Find the ₹1 payment → **Confirm**.  
3. Buyer/checkout polling should move to **SUCCESS**.  
4. Check tally: http://127.0.0.1:4321 (merchant reports) or `GET /api/reports/tally` — success count and sales should include 100 paise.

### 6) Optional reject path

Create another small payment, pay or don’t pay, then **Reject** in pending — status becomes **FAILED**. Funds already received at the VPA are **not** auto-returned by NXPayment (see Rollback below).

## Same-amount concurrency

If two payments for the **same paise amount** are both in progress (e.g. two ₹1 checkouts):

- The second `POST /api/payments` returns **409** `same_amount_in_progress` with `requireConfirmDuplicate: true`.
- Checkout UI should warn; only continue with `confirmDuplicate: true` if you intentionally accept the ambiguity (merchant must match the right bank credit to the right session).

## Timeouts

- Default TTL: `PAYMENT_TTL_MS` = 5 minutes (`deploy/.env.example`).
- If nobody confirms (and the session is still `ACTIVE`/`PROCESSING`) past `expires_at`, the API marks the payment **EXPIRED**.
- Money that already hit your VPA is **not** reversed by expiry — you still reconcile manually.

## Rollback / refund

**NXPayment cannot auto-refund UPI** in this direct-to-merchant model. Funds go straight to the merchant’s bank/UPI account. If you need to undo a test debit:

- Use your bank / UPI app’s **manual reverse / send-back**, or  
- Transfer the amount back yourself from the merchant account.

Do not expect a “Refund” button in NXPayment MVP to move money.

## Integration tests (no real money)

From the repo root (Node **20+**):

```bash
npm run test:integration
```

Uses a **temp SQLite** file — does not touch your merchant DB under `data/`.

## Checklist

- [ ] Node 20+; API `/health` returns ok  
- [ ] Web up; onboarding saved **your** VPA  
- [ ] Created ₹1 checkout; UPI URI shows your VPA  
- [ ] Paid ₹1 from phone; bank SMS/app shows debit  
- [ ] Merchant Confirm → SUCCESS on buyer UI  
- [ ] Tally shows +1 success and +100 paise sales  
- [ ] Tried a second overlapping ₹1 → saw 409 / warning  
- [ ] Left one session until TTL → EXPIRED (optional)  
- [ ] Understood: no auto-refund; reverse manually if needed  
- [ ] `npm run test:integration` green on this machine  
