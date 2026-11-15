import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { getDb } from "../db/schema.js";
import { encryptSecret, tryDecryptSecret } from "../lib/secrets.js";
import { assertCanEditStorageSecrets } from "./staff.js";

export type StorageMode = "local_only" | "local_replica" | "hybrid" | "online_primary";

export type OnlinePrimaryStatus =
  | "disabled"
  | "configured_sqlite_primary"
  | "misconfigured"
  | "unreachable";

export interface StorageSettingsDto {
  mode: StorageMode;
  secondaryPath: string | null;
  onlinePrimaryEnabled: boolean;
  onlineConnectionConfigured: boolean;
  onlinePrimaryStatus: OnlinePrimaryStatus;
  primaryPath: string;
  primaryExists: boolean;
  primarySizeBytes: number | null;
  secondaryExists: boolean;
  secondarySizeBytes: number | null;
  lastBackupAt: string | null;
  lastBackupError: string | null;
  backupIntervalMs: number;
  updatedAt: string;
  sliceNote: string | null;
  conflictPolicy: string;
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

const CONFLICT_POLICY =
  "Writes always hit local SQLite primary. Secondary backup is async file-copy (eventual consistency). " +
  "If secondary fails, checkout continues. Online Postgres DSN is stored encrypted; Slice 2 keeps SQLite as " +
  "authoritative primary — Postgres is a configured secondary/target for Slice 3+ failover. On restore, " +
  "prefer the newer primary mtime; never merge row-level conflicts automatically.";

function fileMeta(p: string): { exists: boolean; size: number | null } {
  try {
    const st = fs.statSync(p);
    return { exists: true, size: st.size };
  } catch {
    return { exists: false, size: null };
  }
}

function probePostgresDsn(dsn: string): OnlinePrimaryStatus {
  // Thin path: validate shape only; do not open a real PG socket without the driver.
  // Marks configured when DSN looks like postgres://… — unreachable if clearly invalid.
  if (!/^postgres(ql)?:\/\//i.test(dsn)) return "misconfigured";
  return "configured_sqlite_primary";
}

export function getStorageSettings(): StorageSettingsDto {
  const row = getDb()
    .prepare("SELECT * FROM storage_settings WHERE id = 1")
    .get() as StorageRow;
  const primary = fileMeta(config.dbPath);
  const secondary = row.secondary_path ? fileMeta(path.resolve(row.secondary_path)) : {
    exists: false,
    size: null,
  };
  const onlineEnabled = row.online_primary_enabled === 1;
  const plain = tryDecryptSecret(row.online_connection_enc);
  const hasConn = Boolean(plain);

  let onlinePrimaryStatus: OnlinePrimaryStatus = "disabled";
  let sliceNote: string | null = null;
  if (onlineEnabled || row.mode === "online_primary" || row.mode === "hybrid") {
    if (!hasConn || !plain) {
      onlinePrimaryStatus = "misconfigured";
      sliceNote = "Online flag on but no encrypted DSN saved.";
    } else {
      onlinePrimaryStatus = probePostgresDsn(plain);
      sliceNote =
        "Postgres DSN stored encrypted. Local SQLite remains write primary in Slice 2; " +
        "DSN is ready for replica/failover work. See conflict policy.";
    }
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
    secondaryExists: secondary.exists,
    secondarySizeBytes: secondary.size,
    lastBackupAt: row.last_backup_at,
    lastBackupError: row.last_backup_error,
    backupIntervalMs: config.storageBackupIntervalMs,
    updatedAt: row.updated_at,
    sliceNote,
    conflictPolicy: CONFLICT_POLICY,
  };
}

export function updateStorageSettings(input: {
  mode?: StorageMode;
  secondaryPath?: string | null;
  onlinePrimaryEnabled?: boolean;
  onlineConnectionString?: string | null;
}): StorageSettingsDto {
  if (
    input.onlineConnectionString !== undefined ||
    input.mode !== undefined ||
    input.onlinePrimaryEnabled !== undefined
  ) {
    assertCanEditStorageSecrets();
  }

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

/** WAL-aware copy of primary SQLite to secondary path. Failures never throw to callers of checkout. */
export function runSecondaryBackup(): {
  ok: boolean;
  copiedTo: string | null;
  error: string | null;
  bytes: number | null;
} {
  const settings = getStorageSettings();
  if (!settings.secondaryPath) {
    return { ok: false, copiedTo: null, error: "secondary_path_not_set", bytes: null };
  }
  if (settings.mode === "local_only") {
    // Still allow manual backup if path set
  }

  const dest = path.resolve(settings.secondaryPath);
  const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
      getDb().pragma("wal_checkpoint(PASSIVE)");
    } catch {
      /* best-effort */
    }
    fs.copyFileSync(config.dbPath, tmp);
    for (const suffix of ["-wal", "-shm"]) {
      const src = config.dbPath + suffix;
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, tmp + suffix);
      }
    }
    fs.renameSync(tmp, dest);
    for (const suffix of ["-wal", "-shm"]) {
      const t = tmp + suffix;
      if (fs.existsSync(t)) {
        fs.renameSync(t, dest + suffix);
      }
    }
    const size = fileMeta(dest).size;
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `UPDATE storage_settings SET last_backup_at = ?, last_backup_error = NULL, updated_at = ? WHERE id = 1`
      )
      .run(now, now);
    return { ok: true, copiedTo: dest, error: null, bytes: size };
  } catch (err) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    const message = err instanceof Error ? err.message : String(err);
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `UPDATE storage_settings SET last_backup_error = ?, updated_at = ? WHERE id = 1`
      )
      .run(message, now);
    return { ok: false, copiedTo: null, error: message, bytes: null };
  }
}

/** Whether the periodic backup job should run for the current mode. */
export function shouldRunPeriodicBackup(): boolean {
  const s = getStorageSettings();
  return Boolean(
    s.secondaryPath &&
      (s.mode === "local_replica" || s.mode === "hybrid" || s.mode === "online_primary")
  );
}
