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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Integration before() failed while building Fastify app: ${msg}. ` +
          `If you see tracingChannel / diagnostics errors, upgrade to Node.js 20+ ` +
          `(current ${process.version}).`
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
});
