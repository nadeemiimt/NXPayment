/**
 * Unified merchant tokens inventory: mask / store / reveal / no leak.
 * Requires Node.js 20+.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import type { FastifyInstance } from "fastify";

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < 20) {
  throw new Error(`Requires Node.js 20+ (got ${process.version}). nvm use 20`);
}

const tmpDir = mkdtempSync(path.join(tmpdir(), "nxpayment-tokens-"));
const dbPath = path.join(tmpDir, "test.sqlite");

process.env.DB_PATH = dbPath;
process.env.ADMIN_TOKEN = "test-admin-token";
process.env.SECRETS_KEY = "test-secrets-key-for-aes";
process.env.WEBHOOK_SECRET = "test-webhook-secret";
process.env.PRIMARY_VPA = "shop@paytm";
process.env.MERCHANT_DISPLAY_NAME = "Test Merchant";
process.env.PAYMENT_TTL_MS = "60000";
process.env.EXPIRE_POLL_MS = "60000";
process.env.WEBHOOK_URL = "";
process.env.API_PORT = "0";
delete process.env.WHATSAPP_TOKEN;
delete process.env.WHATSAPP_PHONE_ID;
delete process.env.YAHOO_CLIENT_ID;
delete process.env.YAHOO_CLIENT_SECRET;

type Json = Record<string, unknown>;

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectStrings(v, out);
    }
  }
  return out;
}

function assertNoLeak(body: unknown, secrets: string[]): void {
  const haystack = collectStrings(body).join("\n");
  for (const secret of secrets) {
    assert.equal(
      haystack.includes(secret),
      false,
      "response must not contain raw secret material"
    );
  }
}

async function json(
  app: FastifyInstance,
  method: string,
  url: string,
  body?: unknown
): Promise<{ status: number; body: Json }> {
  const res = await app.inject({
    method: method as "GET" | "POST" | "PUT" | "DELETE",
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

describe("Merchant tokens inventory", () => {
  let app: FastifyInstance | undefined;
  const FIXTURE_WA = "EAAG-test-whatsapp-token-do-not-leak-99";
  const FIXTURE_PHONE = "123456789012345";

  before(async () => {
    const { closeDb } = await import("../../src/db/schema.js");
    closeDb();
    const { buildApp } = await import("../../src/app.js");
    app = await buildApp({ logger: false });
  });

  after(async () => {
    if (app) await app.close();
    const { closeDb } = await import("../../src/db/schema.js");
    closeDb();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("GET lists tokens masked; runReady when core set", async () => {
    assert.ok(app);
    const { status, body } = await json(app!, "GET", "/api/merchant/tokens");
    assert.equal(status, 200);
    const tokens = body.tokens as Json[];
    assert.ok(Array.isArray(tokens));
    assert.ok(tokens.length >= 10);
    assert.equal(body.runReady, true);
    const wa = tokens.find((t) => t.key === "WHATSAPP_TOKEN") as Json;
    assert.equal(wa.configured, false);
    assert.equal(wa.requirement, "optional");
  });

  test("PUT stores WhatsApp token encrypted; GET never echoes plaintext", async () => {
    assert.ok(app);
    const put = await json(app!, "PUT", "/api/merchant/tokens/WHATSAPP_TOKEN", {
      value: FIXTURE_WA,
    });
    assert.equal(put.status, 200);
    assertNoLeak(put.body, [FIXTURE_WA]);

    const putPhone = await json(app!, "PUT", "/api/merchant/tokens/WHATSAPP_PHONE_ID", {
      value: FIXTURE_PHONE,
    });
    assert.equal(putPhone.status, 200);
    assertNoLeak(putPhone.body, [FIXTURE_WA, FIXTURE_PHONE]);

    const get = await json(app!, "GET", "/api/merchant/tokens");
    assert.equal(get.status, 200);
    assertNoLeak(get.body, [FIXTURE_WA]);
    const tokens = get.body.tokens as Json[];
    const wa = tokens.find((t) => t.key === "WHATSAPP_TOKEN") as Json;
    assert.equal(wa.configured, true);
    assert.equal(wa.source, "db");
    assert.equal(typeof wa.last4, "string");
  });

  test("reveal returns plaintext once; list still masked", async () => {
    assert.ok(app);
    const revealed = await json(app!, "GET", "/api/merchant/tokens/WHATSAPP_TOKEN/reveal");
    assert.equal(revealed.status, 200);
    const token = revealed.body.token as Json;
    assert.equal(token.value, FIXTURE_WA);
    assert.equal(token.source, "db");

    const get = await json(app!, "GET", "/api/merchant/tokens");
    assertNoLeak(get.body, [FIXTURE_WA]);
  });

  test("WhatsApp OTP status becomes configured after tokens saved", async () => {
    assert.ok(app);
    const { status, body } = await json(app!, "GET", "/api/otp/whatsapp/status");
    assert.equal(status, 200);
    assert.equal(body.configured, true);
    assert.equal(body.mode, "meta_cloud");
  });

  test("DELETE clears WhatsApp token", async () => {
    assert.ok(app);
    const del = await json(app!, "DELETE", "/api/merchant/tokens/WHATSAPP_TOKEN");
    assert.equal(del.status, 200);
    const token = del.body.token as Json;
    assert.equal(token.configured, false);

    const revealed = await json(app!, "GET", "/api/merchant/tokens/WHATSAPP_TOKEN/reveal");
    assert.equal((revealed.body.token as Json).value, null);
  });
});
