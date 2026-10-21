import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { config } from "../config.js";

const SALT = "nxpayment-merchant-secrets-v1";
const PREFIX = "v1";

const keyCache = {
  material: "",
  key: Buffer.alloc(0),
};

function ensureKey(): Buffer {
  const material = config.secretsKey;
  if (keyCache.material === material && keyCache.key.length === 32) {
    return keyCache.key;
  }
  keyCache.material = material;
  keyCache.key = scryptSync(material, SALT, 32);
  return keyCache.key;
}

/** Encrypt a UTF-8 secret for SQLite storage. Never log the plaintext. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ensureKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

/** Decrypt a value produced by encryptSecret. */
export function decryptSecret(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("unsupported_secret_ciphertext");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const data = Buffer.from(dataB64, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", ensureKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function last4(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 4) return trimmed;
  return trimmed.slice(-4);
}

/** Stable fingerprint for tests — never a reversible encoding of the secret. */
export function secretFingerprint(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
}

export function encryptionModeNote(): {
  mode: "aes-256-gcm";
  keySource: "SECRETS_KEY" | "ADMIN_TOKEN" | "dev_fallback";
  note: string;
} {
  const keySource = process.env.SECRETS_KEY?.trim()
    ? "SECRETS_KEY"
    : process.env.ADMIN_TOKEN?.trim()
      ? "ADMIN_TOKEN"
      : "dev_fallback";
  return {
    mode: "aes-256-gcm",
    keySource,
    note:
      "Secrets are AES-256-GCM encrypted in SQLite. Protect SECRETS_KEY (or ADMIN_TOKEN) and the DB filesystem.",
  };
}
