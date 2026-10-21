#!/usr/bin/env node
/**
 * One-time local import of Google Web client JSON into NXPayment SQLite via API.
 * Never prints client_secret or full JSON.
 *
 * Usage (API must be running):
 *   node scripts/import-gmail-oauth-local.mjs [/path/to/gmailclientsecret.json]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_PATH = resolve(
  process.env.HOME ?? "",
  "Downloads/gmailclientsecret.json"
);
const apiBase = process.env.API_URL ?? "http://127.0.0.1:3847";
const filePath = resolve(process.argv[2] ?? DEFAULT_PATH);

if (!existsSync(filePath)) {
  console.error("import_skipped: file_not_found");
  process.exit(2);
}

let parsed;
try {
  parsed = JSON.parse(readFileSync(filePath, "utf8"));
} catch {
  console.error("import_failed: invalid_json");
  process.exit(1);
}

if (!parsed?.web?.client_id || !parsed?.web?.client_secret) {
  console.error("import_failed: missing_web_client_fields");
  process.exit(1);
}

const res = await fetch(`${apiBase}/api/merchant/gmail-oauth`, {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ webClientJson: parsed }),
});

const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error("import_failed:", data.error ?? res.status);
  process.exit(1);
}

const status = data.gmailOAuth ?? {};
console.log(
  "import_ok",
  JSON.stringify({
    configured: status.configured === true,
    source: status.source ?? null,
    clientIdLast4: status.clientIdLast4 ?? null,
    clientSecretLast4: status.clientSecretLast4 ?? null,
  })
);
