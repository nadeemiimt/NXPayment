import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { getDb } from "../db/schema.js";
import { encryptSecret, tryDecryptSecret } from "../lib/secrets.js";

export type StorageMode = "local_only" | "local_replica" | "hybrid" | "online_primary";

export interface StorageSettingsDto {
  mode: StorageMode;
  secondaryPath: string | null;
  onlinePrimaryEnabled: boolean;
  /** True when a connection string is stored (never returns the secret). */
  onlineConnectionConfigured: boolean;
  onlinePrimaryStatus: "disabled" | "stub_coming_slice2" | "misconfigured";
  primaryPath: string;
  primaryExists: boolean;
  primarySizeBytes: number | null;
  lastBackupAt: string | null;
  lastBackupError: string | null;
  updatedAt: string;
  sliceNote: string | null;
}

interface StorageRow {
  mode: string;
  secondary_path: string | null;
  online_primary_enabled: number;
  online_connection_enc: string | null;
  last_backup_at: string | null;
  last_backup_error: string | null;
  updated_at: string;
}

function fileMeta(p: string): { exists: boolean; size: number | null } {
  try {
    const st = fs.statSync(p);
    return { exists: true, size: st.size };
  } catch {
    return { exists: false, size: null };
  }
}

export function getStorageSettings(): StorageSettingsDto {
  const row = getDb()
    .prepare("SELECT * FROM storage_settings WHERE id = 1")
    .get() as StorageRow;
  const primary = fileMeta(config.dbPath);
  const onlineEnabled = row.online_primary_enabled === 1;
  const hasConn = Boolean(tryDecryptSecret(row.online_connection_enc));

  let onlinePrimaryStatus: StorageSettingsDto["onlinePrimaryStatus"] = "disabled";
  let sliceNote: string | null = null;
  if (onlineEnabled || row.mode === "online_primary" || row.mode === "hybrid") {
    onlinePrimaryStatus = hasConn ? "stub_coming_slice2" : "misconfigured";
    sliceNote =
      "Online/Postgres primary driver ships in Slice 2 — config and status are wired; writes still use local SQLite WAL.";
  }

  return {
    mode: row.mode as StorageMode,
    secondaryPath: row.secondary_path,
    onlinePrimaryEnabled: onlineEnabled,
    onlineConnectionConfigured: hasConn,
    onlinePrimaryStatus,
    primaryPath: config.dbPath,
    primaryExists: primary.exists,
    primarySizeBytes: primary.size,
    lastBackupAt: row.last_backup_at,
    lastBackupError: row.last_backup_error,
    updatedAt: row.updated_at,
    sliceNote,
  };
}

export function updateStorageSettings(input: {
  mode?: StorageMode;
  secondaryPath?: string | null;
  onlinePrimaryEnabled?: boolean;
  onlineConnectionString?: string | null;
}): StorageSettingsDto {
  const current = getStorageSettings();
  const mode = input.mode ?? current.mode;
  const secondaryPath =
    input.secondaryPath !== undefined ? input.secondaryPath : current.secondaryPath;
  const onlinePrimaryEnabled =
    input.onlinePrimaryEnabled !== undefined
      ? input.onlinePrimaryEnabled
      : current.onlinePrimaryEnabled;

  let onlineEnc: string | null | undefined;
  if (input.onlineConnectionString !== undefined) {
    onlineEnc =
      input.onlineConnectionString && input.onlineConnectionString.length > 0
        ? encryptSecret(input.onlineConnectionString)
        : null;
  }

  const now = new Date().toISOString();
  if (onlineEnc !== undefined) {
    getDb()
      .prepare(
        `UPDATE storage_settings SET mode = ?, secondary_path = ?, online_primary_enabled = ?,
         online_connection_enc = ?, updated_at = ? WHERE id = 1`
      )
      .run(mode, secondaryPath, onlinePrimaryEnabled ? 1 : 0, onlineEnc, now);
  } else {
    getDb()
      .prepare(
        `UPDATE storage_settings SET mode = ?, secondary_path = ?, online_primary_enabled = ?,
         updated_at = ? WHERE id = 1`
      )
      .run(mode, secondaryPath, onlinePrimaryEnabled ? 1 : 0, now);
  }

  return getStorageSettings();
}

/** Copy primary SQLite (+ WAL/SHM if present) to secondary path. Non-blocking for checkout. */
export function runSecondaryBackup(): {
  ok: boolean;
  copiedTo: string | null;
  error: string | null;
} {
  const settings = getStorageSettings();
  if (!settings.secondaryPath) {
    return { ok: false, copiedTo: null, error: "secondary_path_not_set" };
  }
  if (settings.mode === "local_only" && !settings.secondaryPath) {
    return { ok: false, copiedTo: null, error: "mode_local_only" };
  }

  const dest = path.resolve(settings.secondaryPath);
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    // Checkpoint WAL so the main file is consistent enough for a file-level copy
    try {
      getDb().pragma("wal_checkpoint(TRUNCATE)");
    } catch {
      /* best-effort */
    }
    fs.copyFileSync(config.dbPath, dest);
    for (const suffix of ["-wal", "-shm"]) {
      const src = config.dbPath + suffix;
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest + suffix);
      }
    }
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `UPDATE storage_settings SET last_backup_at = ?, last_backup_error = NULL, updated_at = ? WHERE id = 1`
      )
      .run(now, now);
    return { ok: true, copiedTo: dest, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `UPDATE storage_settings SET last_backup_error = ?, updated_at = ? WHERE id = 1`
      )
      .run(message, now);
    return { ok: false, copiedTo: null, error: message };
  }
}
