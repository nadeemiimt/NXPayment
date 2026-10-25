/**
 * Unified merchant tokens: masked status, reveal, update.
 * DB (encrypted) wins over env; bootstrap keys stay in .env.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../db/schema.js";
import { config } from "../config.js";
import {
  decryptSecret,
  encryptSecret,
  encryptionModeNote,
  last4,
} from "./secrets-crypto.js";
import {
  getGmailOAuthCredentials,
  getGmailOAuthMaskedStatus,
  upsertGmailOAuthCredentials,
  clearGmailOAuthCredentials,
} from "./gmail-oauth-credentials.js";
import {
  getMerchantConfig,
  getEmailCredentials,
  updateMerchantConfig,
  connectEmailMailbox,
} from "./merchant.js";
import {
  TOKEN_DEFS,
  getTokenDef,
  type TokenDef,
  type TokenRequirement,
} from "./merchant-tokens-registry.js";

export type TokenSource = "db" | "env" | "none";

export type TokenMaskedItem = {
  key: string;
  label: string;
  description: string;
  requirement: TokenRequirement;
  kind: TokenDef["kind"];
  group: TokenDef["group"];
  sensitive: boolean;
  configured: boolean;
  source: TokenSource;
  last4: string | null;
  maskedPreview: string | null;
  persist: TokenDef["persist"];
  updatedAt: string | null;
};

export type TokensInventory = {
  tokens: TokenMaskedItem[];
  runReady: boolean;
  missingRequired: string[];
  missingRecommended: string[];
  encryption: ReturnType<typeof encryptionModeNote>;
};

type SecretKvRow = {
  key: string;
  value_enc: string;
  last4: string | null;
  updated_at: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../..");
const ENV_PATH = path.resolve(REPO_ROOT, ".env");

function maskPreview(configured: boolean, fingerprint: string | null, sensitive: boolean): string | null {
  if (!configured) return null;
  if (!sensitive) {
    // Non-sensitive: still truncate in list; reveal returns full value.
    return fingerprint ? `…${fingerprint}` : "set";
  }
  return fingerprint ? `••••••••${fingerprint}` : "••••••••";
}

function decryptKv(enc: string | null): string {
  if (!enc) return "";
  try {
    return decryptSecret(enc);
  } catch {
    return "";
  }
}

function readKv(key: string): SecretKvRow | null {
  const row = getDb()
    .prepare(
      `SELECT key, value_enc, last4, updated_at FROM merchant_secrets WHERE key = ?`
    )
    .get(key) as SecretKvRow | undefined;
  return row ?? null;
}

function upsertKv(key: string, plaintext: string): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO merchant_secrets (key, value_enc, last4, updated_at)
       VALUES (@key, @value_enc, @last4, @updated_at)
       ON CONFLICT(key) DO UPDATE SET
         value_enc = excluded.value_enc,
         last4 = excluded.last4,
         updated_at = excluded.updated_at`
    )
    .run({
      key,
      value_enc: encryptSecret(plaintext),
      last4: last4(plaintext),
      updated_at: now,
    });
}

function deleteKv(key: string): void {
  getDb().prepare(`DELETE FROM merchant_secrets WHERE key = ?`).run(key);
}

function envValue(key: string): string {
  const live = process.env[key]?.trim() ?? "";
  if (live) return live;
  // Boot snapshot fallbacks for known config fields
  switch (key) {
    case "ADMIN_TOKEN":
      return config.adminToken || "";
    case "SECRETS_KEY":
      return process.env.SECRETS_KEY?.trim() || "";
    case "GMAIL_REDIRECT_URI":
      return config.gmailRedirectUri || "";
    case "YAHOO_CLIENT_ID":
      return config.yahooClientId || "";
    case "YAHOO_CLIENT_SECRET":
      return config.yahooClientSecret || "";
    case "YAHOO_IMAP_HOST":
      return config.yahooImapHost || "";
    case "WHATSAPP_TOKEN":
      return config.whatsappToken || "";
    case "WHATSAPP_PHONE_ID":
      return config.whatsappPhoneId || "";
    case "WHATSAPP_TEMPLATE_NAME":
      return config.whatsappTemplateName || "";
    case "WHATSAPP_TEMPLATE_LANG":
      return config.whatsappTemplateLang || "";
    case "PRIMARY_VPA":
      return config.primaryVpa || "";
    case "SECONDARY_VPA":
      return config.secondaryVpa || "";
    case "MERCHANT_DISPLAY_NAME":
      return config.displayName || "";
    case "WEBHOOK_SECRET":
      return config.webhookSecret || "";
    case "WEBHOOK_URL":
      return config.webhookUrl || "";
    case "BRAND_NAME":
      return config.brandName || "";
    case "ACCENT_COLOR":
      return config.accentColor || "";
    case "LOGO_URL":
      return config.logoUrl || "";
    case "GMAIL_CLIENT_ID":
      return config.gmailClientId || "";
    case "GMAIL_CLIENT_SECRET":
      return config.gmailClientSecret || "";
    default:
      return "";
  }
}

function isPlaceholder(key: string, value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return true;
  if (key === "PRIMARY_VPA" && v === "merchant@upi") return true;
  if (
    v === "change-me-admin-token" ||
    v === "change-me-webhook-secret" ||
    v === "dev-admin-token" ||
    v === "dev-webhook-secret" ||
    v === "dev-secrets-key"
  ) {
    return true;
  }
  return false;
}

function resolvePlain(key: string): { value: string; source: TokenSource; updatedAt: string | null } {
  const def = getTokenDef(key);
  if (!def) return { value: "", source: "none", updatedAt: null };

  if (def.persist === "merchant_oauth_app") {
    const creds = getGmailOAuthCredentials();
    if (key === "GMAIL_CLIENT_ID") {
      return {
        value: creds.clientId,
        source: creds.source,
        updatedAt: getGmailOAuthMaskedStatus().updatedAt,
      };
    }
    if (key === "GMAIL_CLIENT_SECRET") {
      return {
        value: creds.clientSecret,
        source: creds.source,
        updatedAt: getGmailOAuthMaskedStatus().updatedAt,
      };
    }
  }

  if (def.persist === "merchant_secrets") {
    const row = readKv(key);
    const dbVal = decryptKv(row?.value_enc ?? null);
    if (dbVal) return { value: dbVal, source: "db", updatedAt: row?.updated_at ?? null };
    const env = envValue(key);
    if (env) return { value: env, source: "env", updatedAt: null };
    return { value: "", source: "none", updatedAt: null };
  }

  if (def.persist === "merchant_config") {
    const m = getMerchantConfig();
    const email = getEmailCredentials();
    switch (key) {
      case "PRIMARY_VPA":
        return { value: m.primaryVpa || "", source: m.primaryVpa ? "db" : "none", updatedAt: m.updatedAt };
      case "SECONDARY_VPA":
        return {
          value: m.secondaryVpa || "",
          source: m.secondaryVpa ? "db" : envValue(key) ? "env" : "none",
          updatedAt: m.updatedAt,
        };
      case "MERCHANT_DISPLAY_NAME":
        return { value: m.displayName || "", source: m.displayName ? "db" : "none", updatedAt: m.updatedAt };
      case "WEBHOOK_SECRET":
        return {
          value: m.webhookSecret || "",
          source: m.webhookSecret ? "db" : "none",
          updatedAt: m.updatedAt,
        };
      case "WEBHOOK_URL":
        return {
          value: m.webhookUrl || "",
          source: m.webhookUrl ? "db" : "none",
          updatedAt: m.updatedAt,
        };
      case "BRAND_NAME":
        return { value: m.brandName || "", source: m.brandName ? "db" : "none", updatedAt: m.updatedAt };
      case "ACCENT_COLOR":
        return { value: m.accentColor || "", source: m.accentColor ? "db" : "none", updatedAt: m.updatedAt };
      case "LOGO_URL":
        return {
          value: m.logoUrl || "",
          source: m.logoUrl ? "db" : "none",
          updatedAt: m.updatedAt,
        };
      case "EMAIL_MAILBOX_SECRET":
        return {
          value: email.secret || "",
          source: email.secret ? "db" : "none",
          updatedAt: m.emailConnectedAt,
        };
      default:
        break;
    }
  }

  if (def.persist === "env_file" || def.persist === "env_readonly") {
    const env = envValue(key);
    if (env) return { value: env, source: "env", updatedAt: null };
    return { value: "", source: "none", updatedAt: null };
  }

  return { value: "", source: "none", updatedAt: null };
}

function toMaskedItem(def: TokenDef): TokenMaskedItem {
  const resolved = resolvePlain(def.key);
  const configured = Boolean(resolved.value);
  const fp = configured ? last4(resolved.value) : null;
  return {
    key: def.key,
    label: def.label,
    description: def.description,
    requirement: def.requirement,
    kind: def.kind,
    group: def.group,
    sensitive: def.sensitive,
    configured,
    source: resolved.source,
    last4: fp,
    maskedPreview: maskPreview(configured, fp, def.sensitive),
    persist: def.persist,
    updatedAt: resolved.updatedAt,
  };
}

export function listMerchantTokens(): TokensInventory {
  const tokens = TOKEN_DEFS.map(toMaskedItem);
  const missingRequired: string[] = [];
  const missingRecommended: string[] = [];

  for (const t of tokens) {
    if (t.requirement === "required") {
      const plain = resolvePlain(t.key).value;
      if (!plain || isPlaceholder(t.key, plain)) {
        // PRIMARY_VPA placeholder still counts as "set" for boot, but flag recommended change
        if (t.key === "PRIMARY_VPA" && plain) {
          missingRecommended.push(t.key);
        } else if (t.key === "ADMIN_TOKEN" || t.key === "WEBHOOK_SECRET") {
          if (isPlaceholder(t.key, plain)) missingRecommended.push(t.key);
          else if (!plain) missingRequired.push(t.key);
        } else if (!plain) {
          missingRequired.push(t.key);
        }
      }
    } else if (t.requirement === "recommended") {
      const plain = resolvePlain(t.key).value;
      if (!plain || isPlaceholder(t.key, plain)) missingRecommended.push(t.key);
    }
  }

  // runReady: core checkout can boot (PRIMARY_VPA present — even demo — and admin/webhook have some value)
  const primary = resolvePlain("PRIMARY_VPA").value;
  const admin = resolvePlain("ADMIN_TOKEN").value;
  const wh = resolvePlain("WEBHOOK_SECRET").value;
  const runReady = Boolean(primary && admin && wh);

  return {
    tokens,
    runReady,
    missingRequired,
    missingRecommended,
    encryption: encryptionModeNote(),
  };
}

export function revealMerchantToken(key: string): {
  key: string;
  value: string | null;
  source: TokenSource;
} {
  const def = getTokenDef(key);
  if (!def) throw new Error("unknown_token");
  const resolved = resolvePlain(key);
  if (!resolved.value) return { key, value: null, source: "none" };
  return { key, value: resolved.value, source: resolved.source };
}

function upsertEnvFile(updates: Record<string, string>): void {
  let text = "";
  if (fs.existsSync(ENV_PATH)) {
    text = fs.readFileSync(ENV_PATH, "utf8");
  } else {
    const example = path.resolve(REPO_ROOT, "deploy/.env.example");
    if (fs.existsSync(example)) {
      text = fs.readFileSync(example, "utf8");
    }
  }

  const lines = text.length ? text.split(/\r?\n/) : [];
  const seen = new Set<string>();

  const nextLines = lines.map((line) => {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!m) return line;
    const k = m[1];
    if (updates[k] === undefined) return line;
    seen.add(k);
    const raw = updates[k];
    // Quote if needed
    const needsQuote = /[\s#"']/.test(raw);
    const rendered = needsQuote ? `"${raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : raw;
    return `${k}=${rendered}`;
  });

  for (const [k, raw] of Object.entries(updates)) {
    if (seen.has(k)) continue;
    const needsQuote = /[\s#"']/.test(raw);
    const rendered = needsQuote ? `"${raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : raw;
    nextLines.push(`${k}=${rendered}`);
  }

  fs.writeFileSync(ENV_PATH, nextLines.join("\n").replace(/\n*$/, "\n"), "utf8");
  for (const [k, v] of Object.entries(updates)) {
    process.env[k] = v;
  }
}

export function updateMerchantToken(key: string, value: string): TokenMaskedItem {
  const def = getTokenDef(key);
  if (!def) throw new Error("unknown_token");
  const trimmed = value.trim();
  if (!trimmed) throw new Error("empty_value");
  const min = def.minLength ?? 1;
  const max = def.maxLength ?? 2048;
  if (trimmed.length < min || trimmed.length > max) throw new Error("invalid_length");

  switch (def.persist) {
    case "merchant_oauth_app": {
      if (key === "GMAIL_CLIENT_ID") {
        upsertGmailOAuthCredentials({ clientId: trimmed });
      } else if (key === "GMAIL_CLIENT_SECRET") {
        upsertGmailOAuthCredentials({ clientSecret: trimmed });
      }
      break;
    }
    case "merchant_secrets": {
      upsertKv(key, trimmed);
      break;
    }
    case "merchant_config": {
      if (key === "PRIMARY_VPA") updateMerchantConfig({ primaryVpa: trimmed });
      else if (key === "SECONDARY_VPA") updateMerchantConfig({ secondaryVpa: trimmed });
      else if (key === "MERCHANT_DISPLAY_NAME") updateMerchantConfig({ displayName: trimmed });
      else if (key === "WEBHOOK_URL") updateMerchantConfig({ webhookUrl: trimmed });
      else if (key === "BRAND_NAME") updateMerchantConfig({ brandName: trimmed });
      else if (key === "ACCENT_COLOR") updateMerchantConfig({ accentColor: trimmed });
      else if (key === "LOGO_URL") updateMerchantConfig({ logoUrl: trimmed });
      else if (key === "WEBHOOK_SECRET") {
        getDb()
          .prepare(
            `UPDATE merchant_config SET webhook_secret = ?, updated_at = ? WHERE id = 1`
          )
          .run(trimmed, new Date().toISOString());
      } else if (key === "EMAIL_MAILBOX_SECRET") {
        const email = getEmailCredentials();
        const provider =
          (email.provider as "gmail" | "yahoo" | "mock" | null) || "gmail";
        const address = email.emailAddress || "merchant@gmail.com";
        connectEmailMailbox({
          provider: provider === "mock" ? "gmail" : provider,
          emailAddress: address,
          secret: trimmed,
        });
      }
      break;
    }
    case "env_file": {
      upsertEnvFile({ [key]: trimmed });
      break;
    }
    case "env_readonly":
      throw new Error("readonly_token");
    default:
      throw new Error("unsupported_persist");
  }

  return toMaskedItem(def);
}

export function clearMerchantToken(key: string): TokenMaskedItem {
  const def = getTokenDef(key);
  if (!def) throw new Error("unknown_token");

  switch (def.persist) {
    case "merchant_oauth_app": {
      // Clearing one Gmail field clears both (same as existing DELETE semantics).
      clearGmailOAuthCredentials();
      break;
    }
    case "merchant_secrets": {
      deleteKv(key);
      break;
    }
    case "merchant_config": {
      if (key === "SECONDARY_VPA") updateMerchantConfig({ secondaryVpa: null });
      else if (key === "WEBHOOK_URL") updateMerchantConfig({ webhookUrl: null });
      else if (key === "LOGO_URL") updateMerchantConfig({ logoUrl: null });
      else if (key === "EMAIL_MAILBOX_SECRET") {
        getDb()
          .prepare(
            `UPDATE merchant_config SET email_secret = NULL, updated_at = ? WHERE id = 1`
          )
          .run(new Date().toISOString());
      } else {
        throw new Error("clear_not_allowed");
      }
      break;
    }
    case "env_file": {
      if (key === "SECRETS_KEY") {
        upsertEnvFile({ SECRETS_KEY: "" });
        delete process.env.SECRETS_KEY;
      } else {
        throw new Error("clear_not_allowed");
      }
      break;
    }
    default:
      throw new Error("clear_not_allowed");
  }

  return toMaskedItem(def);
}

/** Runtime resolver for feature code: DB merchant_secrets → env. */
export function resolveRuntimeSecret(key: string): string {
  return resolvePlain(key).value;
}
