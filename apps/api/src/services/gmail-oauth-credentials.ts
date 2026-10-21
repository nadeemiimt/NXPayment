import { z } from "zod";
import { getDb } from "../db/schema.js";
import { config } from "../config.js";
import {
  decryptSecret,
  encryptSecret,
  encryptionModeNote,
  last4,
} from "./secrets-crypto.js";

export type GmailOAuthSource = "db" | "env" | "none";

export type GmailOAuthCredentials = {
  clientId: string;
  clientSecret: string;
  source: GmailOAuthSource;
};

export type GmailOAuthMaskedStatus = {
  configured: boolean;
  source: GmailOAuthSource;
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  clientIdLast4: string | null;
  clientSecretLast4: string | null;
  redirectUris: string[];
  javascriptOrigins: string[];
  defaultRedirectUri: string;
  encryption: ReturnType<typeof encryptionModeNote>;
  updatedAt: string | null;
};

type SecretRow = {
  id: number;
  gmail_client_id_enc: string | null;
  gmail_client_id_last4: string | null;
  gmail_client_secret_enc: string | null;
  gmail_client_secret_last4: string | null;
  redirect_uris_json: string | null;
  javascript_origins_json: string | null;
  updated_at: string | null;
};

const googleWebClientSchema = z.object({
  web: z.object({
    client_id: z.string().min(1).optional(),
    client_secret: z.string().min(1).optional(),
    redirect_uris: z.array(z.string()).optional(),
    javascript_origins: z.array(z.string()).optional(),
  }),
});

function parseJsonStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

function readRow(): SecretRow | null {
  const db = getDb();
  return (
    (db
      .prepare(
        `SELECT id, gmail_client_id_enc, gmail_client_id_last4,
                gmail_client_secret_enc, gmail_client_secret_last4,
                redirect_uris_json, javascript_origins_json, updated_at
         FROM merchant_oauth_app WHERE id = 1`
      )
      .get() as SecretRow | undefined) ?? null
  );
}

function ensureRow(): void {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM merchant_oauth_app WHERE id = 1").get();
  if (existing) return;
  db.prepare(
    `INSERT INTO merchant_oauth_app (id, updated_at) VALUES (1, @updated_at)`
  ).run({ updated_at: new Date().toISOString() });
}

function decryptField(enc: string | null): string {
  if (!enc) return "";
  try {
    return decryptSecret(enc);
  } catch {
    // Wrong SECRETS_KEY or corrupt ciphertext — treat as unset, never leak.
    return "";
  }
}

function envGmailFallback(): { clientId: string; clientSecret: string } {
  // Prefer live process.env so operators can set without restart; config is boot snapshot.
  const clientId =
    process.env.GMAIL_CLIENT_ID?.trim() || config.gmailClientId || "";
  const clientSecret =
    process.env.GMAIL_CLIENT_SECRET?.trim() || config.gmailClientSecret || "";
  return { clientId, clientSecret };
}

/** Runtime resolver: DB merchant credentials win; env is fallback. */
export function getGmailOAuthCredentials(): GmailOAuthCredentials {
  const row = readRow();
  const dbId = decryptField(row?.gmail_client_id_enc ?? null);
  const dbSecret = decryptField(row?.gmail_client_secret_enc ?? null);
  if (dbId && dbSecret) {
    return { clientId: dbId, clientSecret: dbSecret, source: "db" };
  }
  const env = envGmailFallback();
  if (env.clientId && env.clientSecret) {
    return {
      clientId: env.clientId,
      clientSecret: env.clientSecret,
      source: "env",
    };
  }
  return { clientId: "", clientSecret: "", source: "none" };
}

export function getGmailOAuthMaskedStatus(): GmailOAuthMaskedStatus {
  const row = readRow();
  const dbIdConfigured = Boolean(row?.gmail_client_id_enc);
  const dbSecretConfigured = Boolean(row?.gmail_client_secret_enc);
  const dbConfigured = dbIdConfigured && dbSecretConfigured;
  const env = envGmailFallback();
  const envConfigured = Boolean(env.clientId && env.clientSecret);

  let source: GmailOAuthSource = "none";
  if (dbConfigured) source = "db";
  else if (envConfigured) source = "env";

  const redirectUris = parseJsonStringArray(row?.redirect_uris_json ?? null);
  const javascriptOrigins = parseJsonStringArray(row?.javascript_origins_json ?? null);

  return {
    configured: source !== "none",
    source,
    clientIdConfigured: dbIdConfigured || (source === "env" && Boolean(env.clientId)),
    clientSecretConfigured:
      dbSecretConfigured || (source === "env" && Boolean(env.clientSecret)),
    clientIdLast4: dbConfigured
      ? row?.gmail_client_id_last4 ?? null
      : source === "env"
        ? last4(env.clientId)
        : null,
    clientSecretLast4: dbConfigured
      ? row?.gmail_client_secret_last4 ?? null
      : source === "env"
        ? last4(env.clientSecret)
        : null,
    redirectUris:
      redirectUris.length > 0
        ? redirectUris
        : [config.gmailRedirectUri, "http://localhost:3847/api/oauth/google/callback"],
    javascriptOrigins:
      javascriptOrigins.length > 0
        ? javascriptOrigins
        : ["http://127.0.0.1:4321", "http://localhost:4321"],
    defaultRedirectUri: config.gmailRedirectUri,
    encryption: encryptionModeNote(),
    updatedAt: row?.updated_at ?? null,
  };
}

export type UpsertGmailOAuthInput = {
  clientId?: string;
  clientSecret?: string;
  redirectUris?: string[];
  javascriptOrigins?: string[];
  /** Raw Google "Web application" client JSON string or object */
  webClientJson?: unknown;
};

export function parseGoogleWebClientJson(input: unknown): {
  clientId?: string;
  clientSecret?: string;
  redirectUris?: string[];
  javascriptOrigins?: string[];
} {
  let value = input;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error("invalid_web_client_json");
    }
  }
  const parsed = googleWebClientSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("invalid_web_client_json");
  }
  const web = parsed.data.web;
  return {
    clientId: web.client_id,
    clientSecret: web.client_secret,
    redirectUris: web.redirect_uris,
    javascriptOrigins: web.javascript_origins,
  };
}

export function upsertGmailOAuthCredentials(
  input: UpsertGmailOAuthInput
): GmailOAuthMaskedStatus {
  ensureRow();
  const db = getDb();
  const now = new Date().toISOString();

  let clientId = input.clientId?.trim();
  let clientSecret = input.clientSecret?.trim();
  let redirectUris = input.redirectUris;
  let javascriptOrigins = input.javascriptOrigins;

  if (input.webClientJson !== undefined) {
    const fromJson = parseGoogleWebClientJson(input.webClientJson);
    clientId = clientId || fromJson.clientId?.trim();
    clientSecret = clientSecret || fromJson.clientSecret?.trim();
    redirectUris = redirectUris ?? fromJson.redirectUris;
    javascriptOrigins = javascriptOrigins ?? fromJson.javascriptOrigins;
  }

  const sets: string[] = ["updated_at = @updated_at"];
  const params: Record<string, string | null> = { updated_at: now };

  if (clientId) {
    sets.push("gmail_client_id_enc = @gmail_client_id_enc");
    sets.push("gmail_client_id_last4 = @gmail_client_id_last4");
    params.gmail_client_id_enc = encryptSecret(clientId);
    params.gmail_client_id_last4 = last4(clientId);
  }
  if (clientSecret) {
    sets.push("gmail_client_secret_enc = @gmail_client_secret_enc");
    sets.push("gmail_client_secret_last4 = @gmail_client_secret_last4");
    params.gmail_client_secret_enc = encryptSecret(clientSecret);
    params.gmail_client_secret_last4 = last4(clientSecret);
  }
  if (redirectUris) {
    sets.push("redirect_uris_json = @redirect_uris_json");
    params.redirect_uris_json = JSON.stringify(redirectUris);
  }
  if (javascriptOrigins) {
    sets.push("javascript_origins_json = @javascript_origins_json");
    params.javascript_origins_json = JSON.stringify(javascriptOrigins);
  }

  if (sets.length === 1) {
    throw new Error("nothing_to_update");
  }

  db.prepare(`UPDATE merchant_oauth_app SET ${sets.join(", ")} WHERE id = 1`).run(params);
  return getGmailOAuthMaskedStatus();
}

/** Reveal plaintext for local merchant admin copy — never log the return value. */
export function revealGmailOAuthCredentials(): {
  clientId: string | null;
  clientSecret: string | null;
  source: GmailOAuthSource;
} {
  const creds = getGmailOAuthCredentials();
  if (creds.source === "none") {
    return { clientId: null, clientSecret: null, source: "none" };
  }
  return {
    clientId: creds.clientId || null,
    clientSecret: creds.clientSecret || null,
    source: creds.source,
  };
}

export function clearGmailOAuthCredentials(): GmailOAuthMaskedStatus {
  ensureRow();
  const db = getDb();
  db.prepare(
    `UPDATE merchant_oauth_app SET
      gmail_client_id_enc = NULL,
      gmail_client_id_last4 = NULL,
      gmail_client_secret_enc = NULL,
      gmail_client_secret_last4 = NULL,
      redirect_uris_json = NULL,
      javascript_origins_json = NULL,
      updated_at = @updated_at
     WHERE id = 1`
  ).run({ updated_at: new Date().toISOString() });
  return getGmailOAuthMaskedStatus();
}
