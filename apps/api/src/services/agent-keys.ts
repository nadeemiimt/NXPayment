import { createHash, randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { getDb } from "../db/schema.js";
import { getProviderSettings } from "./providers.js";

interface AgentKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  created_at: string;
  revoked_at: string | null;
}

export interface AgentKeyPublic {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  revokedAt: string | null;
  active: boolean;
}

function hashKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function toPublic(row: AgentKeyRow): AgentKeyPublic {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    active: row.revoked_at == null,
  };
}

export function listAgentKeys(): AgentKeyPublic[] {
  const rows = getDb()
    .prepare(`SELECT * FROM agent_api_keys ORDER BY created_at DESC`)
    .all() as AgentKeyRow[];
  return rows.map(toPublic);
}

export function getAgentKeyStatus(): {
  agentsEnabled: boolean;
  hasActiveKey: boolean;
  keys: AgentKeyPublic[];
} {
  const settings = getProviderSettings();
  const keys = listAgentKeys();
  return {
    agentsEnabled: settings.agentsEnabled,
    hasActiveKey: keys.some((k) => k.active),
    keys,
  };
}

/** Generate a new key. Plaintext returned once — never stored. */
export function generateAgentKey(name = "default"): {
  key: AgentKeyPublic;
  apiKey: string;
} {
  const raw = `nxp_agent_${randomBytes(24).toString("base64url")}`;
  const id = nanoid(12);
  const now = new Date().toISOString();
  const prefix = raw.slice(0, 16);

  // Revoke previous active keys — one live key is enough for v1 simplicity.
  getDb()
    .prepare(
      `UPDATE agent_api_keys SET revoked_at = ? WHERE revoked_at IS NULL`
    )
    .run(now);

  getDb()
    .prepare(
      `INSERT INTO agent_api_keys (id, name, key_prefix, key_hash, created_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, NULL)`
    )
    .run(id, name.slice(0, 64), prefix, hashKey(raw), now);

  const row = getDb().prepare("SELECT * FROM agent_api_keys WHERE id = ?").get(id) as AgentKeyRow;
  return { key: toPublic(row), apiKey: raw };
}

export function revokeAgentKey(id: string): AgentKeyPublic | null {
  const row = getDb().prepare("SELECT * FROM agent_api_keys WHERE id = ?").get(id) as
    | AgentKeyRow
    | undefined;
  if (!row) return null;
  if (row.revoked_at) return toPublic(row);
  const now = new Date().toISOString();
  getDb().prepare(`UPDATE agent_api_keys SET revoked_at = ? WHERE id = ?`).run(now, id);
  return toPublic({ ...row, revoked_at: now });
}

export function revokeAllAgentKeys(): number {
  const now = new Date().toISOString();
  const result = getDb()
    .prepare(`UPDATE agent_api_keys SET revoked_at = ? WHERE revoked_at IS NULL`)
    .run(now);
  return result.changes;
}

export class AgentAuthError extends Error {
  constructor(
    message: string,
    public readonly code: "agents_disabled" | "missing_key" | "invalid_key"
  ) {
    super(message);
    this.name = "AgentAuthError";
  }
}

/** Validate Bearer token. Does not return the raw key. */
export function authenticateAgentBearer(authorization: string | undefined): {
  keyId: string;
  keyPrefix: string;
} {
  const settings = getProviderSettings();
  if (!settings.agentsEnabled) {
    throw new AgentAuthError(
      "Shopping agents are turned off. Enable them in Setup.",
      "agents_disabled"
    );
  }
  if (!authorization || !authorization.toLowerCase().startsWith("bearer ")) {
    throw new AgentAuthError("Missing Bearer API key", "missing_key");
  }
  const raw = authorization.slice(7).trim();
  if (!raw) throw new AgentAuthError("Missing Bearer API key", "missing_key");

  const digest = hashKey(raw);
  const row = getDb()
    .prepare(
      `SELECT * FROM agent_api_keys WHERE key_hash = ? AND revoked_at IS NULL LIMIT 1`
    )
    .get(digest) as AgentKeyRow | undefined;
  if (!row) throw new AgentAuthError("Invalid or revoked API key", "invalid_key");
  return { keyId: row.id, keyPrefix: row.key_prefix };
}
