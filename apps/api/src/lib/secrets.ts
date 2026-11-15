import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { config } from "../config.js";

const ALGO = "aes-256-gcm";

function deriveKey(): Buffer {
  const salt = createHash("sha256").update("nxpayment-storage-v1").digest();
  return scryptSync(config.adminToken, salt, 32);
}

/** Encrypt a UTF-8 string for at-rest settings. Returns `iv:tag:ciphertext` hex. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptSecret(packed: string): string {
  const [ivHex, tagHex, dataHex] = packed.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("invalid_secret_blob");
  const decipher = createDecipheriv(ALGO, deriveKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

export function tryDecryptSecret(packed: string | null | undefined): string | null {
  if (!packed) return null;
  try {
    return decryptSecret(packed);
  } catch {
    return null;
  }
}
