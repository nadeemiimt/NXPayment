/**
 * Integration tests: real Fastify inject + temp SQLite.
 * Requires Node.js 20+ (Fastify 5). Env must be set before API imports.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import type { FastifyInstance } from "fastify";

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < 20) {
  throw new Error(
    `NXPayment integration tests require Node.js 20+ (got ${process.version} at ${process.execPath}). ` +
      `nvm users: nvm install 20 && nvm use 20`
  );
}

const tmpDir = mkdtempSync(path.join(tmpdir(), "nxpayment-it-"));
const dbPath = path.join(tmpDir, "test.sqlite");

process.env.DB_PATH = dbPath;
process.env.ADMIN_TOKEN = "test-admin-token";
process.env.WEBHOOK_SECRET = "test-webhook-secret";
process.env.PRIMARY_VPA = "merchant@upi";
process.env.MERCHANT_DISPLAY_NAME = "Test Merchant";
process.env.PAYMENT_TTL_MS = "200";
process.env.EXPIRE_POLL_MS = "60000";
process.env.WEBHOOK_URL = "";
process.env.API_PORT = "0";

type Json = Record<string, unknown>;

async function json(
  app: FastifyInstance,
  method: string,
  url: string,
  body?: unknown
): Promise<{ status: number; body: Json }> {
  const res = await app.inject({
    method: method as "GET" | "POST" | "PUT",
    url,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    payload: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let parsed: Json = {};
  try {
    parsed = res.json() as Json;
  } catch {
    parsed = { raw: res.body };
  }
  return { status: res.statusCode, body: parsed };
}

describe("NXPayment API integration", () => {
  let app: FastifyInstance | undefined;
  let expireDuePayments: (() => number) | undefined;

  before(async () => {
    try {
      const appMod = await import("../../src/app.js");
      const paymentsMod = await import("../../src/services/payments.js");
      expireDuePayments = paymentsMod.expireDuePayments;
      // inject() — no listen(); ready() loads plugins + opens temp DB
      app = await appMod.buildApp({ logger: false });
      await app.ready();
      // Existing suite creates concurrent payments; FIFO tests cover single-slot separately.
      await json(app, "PUT", "/api/merchant/config", { singleSlotFifo: false });
      await json(app, "PUT", "/api/credits/settings", {
        autoConfirmEnabled: true,
        emailAutoConfirm: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      let hint =
        `If you see tracingChannel / diagnostics errors, upgrade to Node.js 20+ ` +
        `(current ${process.version}).`;
      if (/NODE_MODULE_VERSION|better-sqlite3/i.test(msg)) {
        hint =
          "Run `npm rebuild better-sqlite3` (or reinstall node_modules) under the same Node you use for tests.";
      }
      throw new Error(
        `Integration before() failed while building Fastify app: ${msg}. ${hint}`
      );
    }
  });

  after(async () => {
    if (app) {
      await app.close();
    }
    try {
      const { closeDb } = await import("../../src/db/schema.js");
      closeDb();
    } catch {
      /* db may never have opened */
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function requireApp(): FastifyInstance {
    assert.ok(app, "app not initialized");
    return app;
  }

  test("health", async () => {
    const res = await json(requireApp(), "GET", "/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  test("create → get status → merchant confirm → SUCCESS", async () => {
    const created = await json(requireApp(), "POST", "/api/payments", {
      amountPaise: 101,
      note: "happy-path",
    });
    assert.equal(created.status, 201);
    const payment = created.body.payment as Json;
    assert.equal(payment.status, "ACTIVE");
    assert.ok(typeof payment.id === "string");
    assert.ok(String(payment.upiUri).startsWith("upi://pay?"));

    const got = await json(requireApp(), "GET", `/api/payments/${payment.id}`);
    assert.equal(got.status, 200);
    assert.equal((got.body.payment as Json).status, "ACTIVE");

    const confirmed = await json(
      requireApp(),
      "POST",
      `/api/payments/${payment.id}/confirm`
    );
    assert.equal(confirmed.status, 200);
    assert.equal((confirmed.body.payment as Json).status, "SUCCESS");
    assert.ok((confirmed.body.payment as Json).confirmedAt);
  });

  test("confirm accepts Content-Type JSON with empty body", async () => {
    const created = await json(requireApp(), "POST", "/api/payments", {
      amountPaise: 199,
    });
    assert.equal(created.status, 201);
    const id = (created.body.payment as Json).id as string;

    // Mimic browser fetch that sets application/json but sends no payload
    const res = await requireApp().inject({
      method: "POST",
      url: `/api/payments/${id}/confirm`,
      headers: { "content-type": "application/json" },
      payload: "",
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { payment: Json };
    assert.equal(body.payment.status, "SUCCESS");
  });

  test("reject path → FAILED", async () => {
    const created = await json(requireApp(), "POST", "/api/payments", {
      amountPaise: 102,
    });
    assert.equal(created.status, 201);
    const id = (created.body.payment as Json).id;

    const rejected = await json(requireApp(), "POST", `/api/payments/${id}/reject`, {
      reason: "Buyer mismatch",
    });
    assert.equal(rejected.status, 200);
    assert.equal((rejected.body.payment as Json).status, "FAILED");
  });

  test("same-amount in progress → 409 unless confirmDuplicate", async () => {
    const first = await json(requireApp(), "POST", "/api/payments", {
      amountPaise: 777,
    });
    assert.equal(first.status, 201);

    const conflict = await json(requireApp(), "POST", "/api/payments", {
      amountPaise: 777,
    });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error, "same_amount_in_progress");
    assert.equal(conflict.body.requireConfirmDuplicate, true);

    const allowed = await json(requireApp(), "POST", "/api/payments", {
      amountPaise: 777,
      confirmDuplicate: true,
    });
    assert.equal(allowed.status, 201);
    assert.equal((allowed.body.payment as Json).status, "ACTIVE");

    await json(
      requireApp(),
      "POST",
      `/api/payments/${(first.body.payment as Json).id}/reject`
    );
    await json(
      requireApp(),
      "POST",
      `/api/payments/${(allowed.body.payment as Json).id}/reject`
    );
  });

  test("payment TTL / expire → EXPIRED", async () => {
    const created = await json(requireApp(), "POST", "/api/payments", {
      amountPaise: 103,
    });
    assert.equal(created.status, 201);
    const id = (created.body.payment as Json).id as string;

    await new Promise((r) => setTimeout(r, 250));
    assert.ok(expireDuePayments, "expireDuePayments not loaded");
    const n = expireDuePayments();
    assert.ok(n >= 1);

    const got = await json(requireApp(), "GET", `/api/payments/${id}`);
    assert.equal(got.status, 200);
    assert.equal((got.body.payment as Json).status, "EXPIRED");
  });

  test("idempotency on create returns same payment", async () => {
    const key = "idem-key-integration-01";
    const a = await json(requireApp(), "POST", "/api/payments", {
      amountPaise: 104,
      idempotencyKey: key,
    });
    assert.equal(a.status, 201);
    const idA = (a.body.payment as Json).id;

    const b = await json(requireApp(), "POST", "/api/payments", {
      amountPaise: 104,
      idempotencyKey: key,
    });
    assert.equal(b.status, 201);
    assert.equal((b.body.payment as Json).id, idA);

    await json(requireApp(), "POST", `/api/payments/${idA}/confirm`);
  });

  test("tally aggregates success, failed, sales", async () => {
    const from = new Date(Date.now() - 60_000).toISOString();

    const ok = await json(requireApp(), "POST", "/api/payments", { amountPaise: 500 });
    await json(
      requireApp(),
      "POST",
      `/api/payments/${(ok.body.payment as Json).id}/confirm`
    );

    const bad = await json(requireApp(), "POST", "/api/payments", { amountPaise: 501 });
    await json(
      requireApp(),
      "POST",
      `/api/payments/${(bad.body.payment as Json).id}/reject`
    );

    const to = new Date(Date.now() + 1000).toISOString();
    const report = await json(
      requireApp(),
      "GET",
      `/api/reports/tally?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    assert.equal(report.status, 200);
    const tally = report.body.tally as Json;
    assert.ok((tally.successCount as number) >= 1);
    assert.ok((tally.failedCount as number) >= 1);
    assert.ok((tally.totalSalesPaise as number) >= 500);
    assert.ok((tally.paymentCount as number) >= 2);
  });

  test("webhook: no URL → safe skip", async () => {
    const cfg = await json(requireApp(), "PUT", "/api/merchant/config", {
      webhookUrl: null,
    });
    assert.equal(cfg.status, 200);

    const created = await json(requireApp(), "POST", "/api/payments", {
      amountPaise: 105,
    });
    const id = (created.body.payment as Json).id;
    await json(requireApp(), "POST", `/api/payments/${id}/confirm`);

    const deliveries = await json(requireApp(), "GET", "/api/merchant/webhooks");
    assert.equal(deliveries.status, 200);
    const list = deliveries.body.deliveries as Json[];
    const match = list.find((d) => d.paymentId === id);
    assert.ok(match, "expected webhook delivery row");
    assert.equal(match!.status, "skipped_no_url");
  });

  test("webhook: HMAC delivery when URL configured", async () => {
    const received: {
      headers: IncomingMessage["headers"];
      body: string;
    }[] = [];

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        received.push({
          headers: req.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    const webhookUrl = `http://127.0.0.1:${addr.port}/hook`;

    try {
      const cfg = await json(requireApp(), "PUT", "/api/merchant/config", {
        webhookUrl,
      });
      assert.equal(cfg.status, 200);

      const created = await json(requireApp(), "POST", "/api/payments", {
        amountPaise: 106,
      });
      const id = (created.body.payment as Json).id;
      await json(requireApp(), "POST", `/api/payments/${id}/confirm`);

      const deadline = Date.now() + 3000;
      while (received.length === 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }

      assert.equal(received.length, 1);
      const hit = received[0]!;
      assert.equal(hit.headers["x-nxpayment-event"], "payment.success");
      const sig = hit.headers["x-nxpayment-signature"];
      assert.ok(typeof sig === "string");
      const expected = createHmac("sha256", "test-webhook-secret")
        .update(hit.body)
        .digest("hex");
      assert.equal(sig, expected);
      const payload = JSON.parse(hit.body) as Json;
      assert.equal(payload.event, "payment.success");
      assert.equal((payload.payment as Json).id, id);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
      await json(requireApp(), "PUT", "/api/merchant/config", { webhookUrl: null });
    }
  });

  test("YouPI-style SMS parse → unique amount auto-confirms", async () => {
    const created = await json(requireApp(), "POST", "/api/payments", {
      amountPaise: 49900,
      note: "matcher-unique",
    });
    assert.equal(created.status, 201);
    const id = (created.body.payment as Json).id;
    assert.ok(typeof (created.body.payment as Json).riskScore === "number");

    const obs = await json(requireApp(), "POST", "/api/credits/observe", {
      source: "sms",
      rawText:
        "Dear SBI user, A/C 1234 credited by Rs 499.00 on 08Sep26 by UPI/CR/667788/buyer@okhdfcbank Ref: 667788.",
    });
    assert.equal(obs.status, 200);
    assert.equal(obs.body.outcome, "confirmed");
    assert.equal((obs.body.payment as Json).id, id);
    assert.equal((obs.body.payment as Json).status, "SUCCESS");
  });

  test("ambiguous same-amount credit skips auto-confirm", async () => {
    const a = await json(requireApp(), "POST", "/api/payments", {
      amountPaise: 77700,
      confirmDuplicate: true,
    });
    const b = await json(requireApp(), "POST", "/api/payments", {
      amountPaise: 77700,
      confirmDuplicate: true,
    });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);

    const obs = await json(requireApp(), "POST", "/api/credits/observe", {
      source: "email_gmail",
      subject: "ALERT: Account credited with Rs. 777.00",
      rawText: "credited with Rs. 777.00 Ref no: UTR-AMB-1",
    });
    assert.equal(obs.body.outcome, "skipped_ambiguous");
    const gotA = await json(requireApp(), "GET", `/api/payments/${(a.body.payment as Json).id}`);
    assert.equal((gotA.body.payment as Json).status, "ACTIVE");
  });

  test("single-slot FIFO blocks second in-progress payment", async () => {
    await json(requireApp(), "PUT", "/api/merchant/config", { singleSlotFifo: true });
    const first = await json(requireApp(), "POST", "/api/payments", {
      amountPaise: 111,
      confirmDuplicate: true,
      overrideFifo: true,
    });
    assert.equal(first.status, 201);

    const blocked = await json(requireApp(), "POST", "/api/payments", {
      amountPaise: 222,
    });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error, "fifo_slot_busy");

    const override = await json(requireApp(), "POST", "/api/payments", {
      amountPaise: 222,
      overrideFifo: true,
    });
    assert.equal(override.status, 201);

    await json(requireApp(), "PUT", "/api/merchant/config", { singleSlotFifo: false });
    await json(
      requireApp(),
      "POST",
      `/api/payments/${(first.body.payment as Json).id}/reject`
    );
    await json(
      requireApp(),
      "POST",
      `/api/payments/${(override.body.payment as Json).id}/reject`
    );
  });

  test("manual confirm still works alongside observers", async () => {
    const created = await json(requireApp(), "POST", "/api/payments", {
      amountPaise: 333,
    });
    const id = (created.body.payment as Json).id;
    const confirmed = await json(requireApp(), "POST", `/api/payments/${id}/confirm`, {});
    assert.equal(confirmed.status, 200);
    assert.equal((confirmed.body.payment as Json).status, "SUCCESS");
  });

  test("WhatsApp OTP stub send + verify (dry-run)", async () => {
    const status = await json(requireApp(), "GET", "/api/otp/whatsapp/status");
    assert.equal(status.status, 200);
    assert.equal(status.body.mode, "stub");
    assert.equal(status.body.configured, false);

    await json(requireApp(), "PUT", "/api/merchant/config", {
      whatsappOtpEnabled: true,
      whatsappOtpPhone: "+919876543210",
    });

    const sent = await json(requireApp(), "POST", "/api/otp/whatsapp/send", {
      phoneE164: "+919876543210",
      purpose: "onboarding_gate",
    });
    assert.equal(sent.status, 201);
    assert.equal(sent.body.mode, "stub");
    assert.ok(typeof sent.body.stubCode === "string");
    assert.ok(typeof sent.body.challengeId === "string");

    const bad = await json(requireApp(), "POST", "/api/otp/whatsapp/verify", {
      challengeId: sent.body.challengeId,
      code: "000000",
    });
    assert.equal(bad.status, 400);

    const ok = await json(requireApp(), "POST", "/api/otp/whatsapp/verify", {
      challengeId: sent.body.challengeId,
      code: sent.body.stubCode,
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.ok, true);

    const cfg = await json(requireApp(), "GET", "/api/merchant/config");
    assert.ok((cfg.body.config as Json).whatsappVerifiedAt);
  });

  test("till desk cash + card_counter confirm", async () => {
    const cash = await json(requireApp(), "POST", "/api/till/sales", {
      amountPaise: 15000,
      method: "cash",
      note: "counter cash",
      confirm: true,
    });
    assert.equal(cash.status, 201);
    assert.equal((cash.body.payment as Json).status, "SUCCESS");
    assert.equal((cash.body.payment as Json).method, "cash");
    assert.equal((cash.body.payment as Json).railId, "till_desk");

    const openCard = await json(requireApp(), "POST", "/api/till/sales", {
      amountPaise: 25000,
      method: "card_counter",
      confirm: false,
    });
    assert.equal(openCard.status, 201);
    assert.equal((openCard.body.payment as Json).status, "ACTIVE");
    const cardId = (openCard.body.payment as Json).id as string;

    const openList = await json(requireApp(), "GET", "/api/till/open");
    assert.ok(
      ((openList.body.payments as Json[]) ?? []).some((p) => p.id === cardId)
    );

    const confirmed = await json(
      requireApp(),
      "POST",
      `/api/till/sales/${cardId}/confirm`,
      {}
    );
    assert.equal(confirmed.status, 200);
    assert.equal((confirmed.body.payment as Json).status, "SUCCESS");
  });

  test("alerts read + dismiss", async () => {
    // Force a high-risk path: fifo override + same amount open bump score.
    await json(requireApp(), "PUT", "/api/merchant/config", { singleSlotFifo: false });
    const a = await json(requireApp(), "POST", "/api/payments", {
      amountPaise: 88800,
    });
    assert.equal(a.status, 201);
    const b = await json(requireApp(), "POST", "/api/payments", {
      amountPaise: 88800,
      confirmDuplicate: true,
    });
    assert.equal(b.status, 201);
    // sameAmountOpen on second create should raise risk; may or may not hit 60.
    const alerts = await json(requireApp(), "GET", "/api/alerts");
    assert.equal(alerts.status, 200);
    assert.ok(Array.isArray(alerts.body.alerts));
    assert.ok(typeof alerts.body.unreadCount === "number");

    // Create an explicit alert via till sale (always pushes till_sale).
    const till = await json(requireApp(), "POST", "/api/till/sales", {
      amountPaise: 100,
      method: "cash",
      confirm: true,
    });
    assert.equal(till.status, 201);

    const after = await json(requireApp(), "GET", "/api/alerts");
    const list = after.body.alerts as Json[];
    assert.ok(list.length >= 1);
    const first = list[0]!;
    const id = first.id as string;

    const read = await json(requireApp(), "POST", `/api/alerts/${id}/read`, {});
    assert.equal(read.status, 200);

    const dismiss = await json(requireApp(), "POST", `/api/alerts/${id}/dismiss`, {});
    assert.equal(dismiss.status, 200);

    const final = await json(requireApp(), "GET", "/api/alerts");
    assert.ok(!(final.body.alerts as Json[]).some((x) => x.id === id));

    await json(requireApp(), "POST", "/api/alerts/read-all", {});
  });

  test("white-label config hideNxChrome + brandName", async () => {
    const updated = await json(requireApp(), "PUT", "/api/merchant/config", {
      brandName: "Acme Pay",
      hideNxChrome: true,
    });
    assert.equal(updated.status, 200);
    assert.equal((updated.body.config as Json).brandName, "Acme Pay");
    assert.equal((updated.body.config as Json).hideNxChrome, true);
  });
});
