/**
 * Gmail OAuth merchant secrets: mask/store/encrypt.
 * Asserts responses never echo raw client_secret / client_id after save.
 * Requires Node.js 20+.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import type { FastifyInstance } from "fastify";

function expectedLast4(value: string): string {
  const body = value.replace(/\.apps\.googleusercontent\.com$/i, "");
  const base = body.length >= 4 ? body : value;
  return base.length <= 4 ? base : base.slice(-4);
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < 20) {
  throw new Error(
    `Requires Node.js 20+ (got ${process.version}). nvm use 20`
  );
}

const tmpDir = mkdtempSync(path.join(tmpdir(), "nxpayment-gmail-oauth-"));
const dbPath = path.join(tmpDir, "test.sqlite");

process.env.DB_PATH = dbPath;
process.env.ADMIN_TOKEN = "test-admin-token";
process.env.SECRETS_KEY = "test-secrets-key-for-aes";
process.env.WEBHOOK_SECRET = "test-webhook-secret";
process.env.PRIMARY_VPA = "merchant@upi";
process.env.MERCHANT_DISPLAY_NAME = "Test Merchant";
process.env.PAYMENT_TTL_MS = "60000";
process.env.EXPIRE_POLL_MS = "60000";
process.env.WEBHOOK_URL = "";
process.env.API_PORT = "0";
// Ensure env fallback is empty so DB path is exercised first
delete process.env.GMAIL_CLIENT_ID;
delete process.env.GMAIL_CLIENT_SECRET;

type Json = Record<string, unknown>;

/** Recursively collect string values from a JSON tree (for leak assertions). */
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

describe("Gmail OAuth merchant secrets", () => {
  let app: FastifyInstance | undefined;

  // Intentionally opaque test fixtures — never printed by assertions above.
  const FIXTURE_CLIENT_ID =
    "123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com";
  const FIXTURE_CLIENT_SECRET = "GOCSPX-TestSecretDoNotLeakInOutput99";

  before(async () => {
    const appMod = await import("../../src/app.js");
    app = await appMod.buildApp({ logger: false });
    await app.ready();
  });

  after(async () => {
    if (app) await app.close();
    const schema = await import("../../src/db/schema.js");
    schema.closeDb();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("GET returns unconfigured mask indicators (no secrets)", async () => {
    assert.ok(app);
    const { status, body } = await json(app, "GET", "/api/merchant/gmail-oauth");
    assert.equal(status, 200);
    const gmailOAuth = body.gmailOAuth as Json;
    assert.equal(gmailOAuth.configured, false);
    assert.equal(gmailOAuth.source, "none");
    assertNoLeak(body, [FIXTURE_CLIENT_ID, FIXTURE_CLIENT_SECRET]);
  });

  test("PUT stores encrypted secrets; GET masks with last4", async () => {
    assert.ok(app);
    const put = await json(app, "PUT", "/api/merchant/gmail-oauth", {
      clientId: FIXTURE_CLIENT_ID,
      clientSecret: FIXTURE_CLIENT_SECRET,
      redirectUris: ["http://127.0.0.1:3847/api/oauth/google/callback"],
    });
    assert.equal(put.status, 200);
    assertNoLeak(put.body, [FIXTURE_CLIENT_ID, FIXTURE_CLIENT_SECRET]);

    const gmailOAuth = put.body.gmailOAuth as Json;
    assert.equal(gmailOAuth.configured, true);
    assert.equal(gmailOAuth.source, "db");
    assert.equal(gmailOAuth.clientIdConfigured, true);
    assert.equal(gmailOAuth.clientSecretConfigured, true);
    assert.equal(gmailOAuth.clientIdLast4, expectedLast4(FIXTURE_CLIENT_ID));
    assert.equal(gmailOAuth.clientSecretLast4, expectedLast4(FIXTURE_CLIENT_SECRET));
    assert.equal((gmailOAuth.encryption as Json).mode, "aes-256-gcm");

    const get = await json(app, "GET", "/api/merchant/gmail-oauth");
    assert.equal(get.status, 200);
    assertNoLeak(get.body, [FIXTURE_CLIENT_ID, FIXTURE_CLIENT_SECRET]);
    assert.equal((get.body.gmailOAuth as Json).configured, true);
  });

  test("PUT accepts Google web client JSON shape", async () => {
    assert.ok(app);
    const altId = "999999999999-webjsonshape.apps.googleusercontent.com";
    const altSecret = "GOCSPX-WebJsonShapeSecretOnly";
    const put = await json(app, "PUT", "/api/merchant/gmail-oauth", {
      webClientJson: {
        web: {
          client_id: altId,
          client_secret: altSecret,
          redirect_uris: ["http://127.0.0.1:3847/api/oauth/google/callback"],
          javascript_origins: ["http://127.0.0.1:4321"],
        },
      },
    });
    assert.equal(put.status, 200);
    assertNoLeak(put.body, [altId, altSecret, FIXTURE_CLIENT_SECRET]);
    const gmailOAuth = put.body.gmailOAuth as Json;
    assert.equal(gmailOAuth.clientIdLast4, expectedLast4(altId));
    assert.equal(gmailOAuth.clientSecretLast4, expectedLast4(altSecret));
    const uris = gmailOAuth.redirectUris as string[];
    assert.ok(uris.includes("http://127.0.0.1:3847/api/oauth/google/callback"));
  });

  test("reveal returns plaintext for admin copy; credit status shows configured", async () => {
    assert.ok(app);
    const reveal = await json(app, "GET", "/api/merchant/gmail-oauth/reveal");
    assert.equal(reveal.status, 200);
    const revealed = reveal.body.gmailOAuth as Json;
    assert.equal(typeof revealed.clientId, "string");
    assert.equal(typeof revealed.clientSecret, "string");
    assert.ok((revealed.clientId as string).endsWith(".apps.googleusercontent.com"));
    assert.ok((revealed.clientSecret as string).startsWith("GOCSPX-"));
    // Do not assert.equal full secret strings into failure messages — length only.
    assert.ok((revealed.clientSecret as string).length >= 8);

    const status = await json(app, "GET", "/api/credits/email/status");
    assert.equal(status.status, 200);
    assert.equal(status.body.gmailOAuthConfigured, true);
    assertNoLeak(status.body, [
      revealed.clientSecret as string,
      FIXTURE_CLIENT_SECRET,
    ]);
  });

  test("DELETE clears DB; falls back to none without env", async () => {
    assert.ok(app);
    const del = await json(app, "DELETE", "/api/merchant/gmail-oauth");
    assert.equal(del.status, 200);
    assert.equal((del.body.gmailOAuth as Json).source, "none");
    assert.equal((del.body.gmailOAuth as Json).configured, false);

    const status = await json(app, "GET", "/api/credits/email/status");
    assert.equal(status.body.gmailOAuthConfigured, false);
  });

  test("env fallback when DB empty", async () => {
    assert.ok(app);
    const envId = "env-fallback-id.apps.googleusercontent.com";
    const envSecret = "GOCSPX-EnvFallbackSecret";
    process.env.GMAIL_CLIENT_ID = envId;
    process.env.GMAIL_CLIENT_SECRET = envSecret;

    const get = await json(app, "GET", "/api/merchant/gmail-oauth");
    assert.equal(get.status, 200);
    assert.equal((get.body.gmailOAuth as Json).configured, true);
    assert.equal((get.body.gmailOAuth as Json).source, "env");
    assert.equal((get.body.gmailOAuth as Json).clientIdLast4, expectedLast4(envId));
    assertNoLeak(get.body, [envId, envSecret]);

    const status = await json(app, "GET", "/api/credits/email/status");
    assert.equal(status.body.gmailOAuthConfigured, true);
    assertNoLeak(status.body, [envSecret]);

    delete process.env.GMAIL_CLIENT_ID;
    delete process.env.GMAIL_CLIENT_SECRET;
  });
});
