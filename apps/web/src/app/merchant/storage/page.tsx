"use client";

import { useEffect, useState } from "react";
import { api, type StorageMode, type StorageSettings } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function StoragePage() {
  const [storage, setStorage] = useState<StorageSettings | null>(null);
  const [mode, setMode] = useState<StorageMode>("local_only");
  const [secondaryPath, setSecondaryPath] = useState("");
  const [onlineEnabled, setOnlineEnabled] = useState(false);
  const [onlineConn, setOnlineConn] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const r = await api.getStorage();
    setStorage(r.storage);
    setMode(r.storage.mode);
    setSecondaryPath(r.storage.secondaryPath ?? "");
    setOnlineEnabled(r.storage.onlinePrimaryEnabled);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function save() {
    setError(null);
    setMsg(null);
    try {
      const r = await api.updateStorage({
        mode,
        secondaryPath: secondaryPath.trim() || null,
        onlinePrimaryEnabled: onlineEnabled,
        onlineConnectionString: onlineConn.trim() ? onlineConn.trim() : undefined,
      });
      setStorage(r.storage);
      setOnlineConn("");
      setMsg("Storage settings saved. Connection strings stay encrypted at rest.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function backup() {
    setError(null);
    setMsg(null);
    try {
      const r = await api.runBackup();
      setStorage(r.storage);
      setMsg(r.backup.ok ? `Backup copied to ${r.backup.copiedTo}` : r.backup.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backup failed");
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Storage</h1>
      <p className="mt-2 max-w-2xl text-[var(--nx-muted)]">
        Local SQLite WAL stays primary. Optional secondary file backup; hybrid/online Postgres is
        configured here but ships in Slice 2.
      </p>

      {error && <p className="mt-3 text-sm text-[#9B2C2C]">{error}</p>}
      {msg && <p className="mt-3 text-sm text-[var(--nx-accent)]">{msg}</p>}

      <div className="mt-8 space-y-5">
        <label className="block max-w-md">
          <span className="text-sm text-[var(--nx-muted)]">Mode</span>
          <select
            className="mt-1 flex h-11 w-full rounded-md border border-[var(--nx-line)] bg-white/80 px-3"
            value={mode}
            onChange={(e) => setMode(e.target.value as StorageMode)}
          >
            <option value="local_only">Local only</option>
            <option value="local_replica">Local + secondary backup path</option>
            <option value="hybrid">Hybrid (local primary + online flag)</option>
            <option value="online_primary">Online primary (Slice 2 stub)</option>
          </select>
        </label>

        <label className="block max-w-xl">
          <span className="text-sm text-[var(--nx-muted)]">Secondary SQLite path</span>
          <Input
            className="mt-1"
            placeholder="/path/to/backup.sqlite"
            value={secondaryPath}
            onChange={(e) => setSecondaryPath(e.target.value)}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlineEnabled}
            onChange={(e) => setOnlineEnabled(e.target.checked)}
          />
          Enable online / hybrid flag
        </label>

        <label className="block max-w-xl">
          <span className="text-sm text-[var(--nx-muted)]">
            Online connection string (encrypted; leave blank to keep existing)
          </span>
          <Input
            className="mt-1"
            type="password"
            autoComplete="off"
            placeholder="postgres://…"
            value={onlineConn}
            onChange={(e) => setOnlineConn(e.target.value)}
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={save}>
            Save
          </Button>
          <Button type="button" variant="outline" onClick={backup}>
            Run secondary backup now
          </Button>
        </div>
      </div>

      {storage && (
        <dl className="mt-10 grid max-w-2xl gap-3 text-sm sm:grid-cols-2">
          <Status label="Primary path" value={storage.primaryPath} />
          <Status
            label="Primary size"
            value={
              storage.primarySizeBytes != null
                ? `${Math.round(storage.primarySizeBytes / 1024)} KB`
                : "—"
            }
          />
          <Status label="Online status" value={storage.onlinePrimaryStatus} />
          <Status
            label="Online configured"
            value={storage.onlineConnectionConfigured ? "yes" : "no"}
          />
          <Status label="Last backup" value={storage.lastBackupAt ?? "—"} />
          <Status label="Backup error" value={storage.lastBackupError ?? "—"} />
        </dl>
      )}
      {storage?.sliceNote && (
        <p className="mt-4 max-w-2xl text-sm text-[var(--nx-muted)]">{storage.sliceNote}</p>
      )}
      {storage?.conflictPolicy && (
        <p className="mt-3 max-w-2xl text-xs text-[var(--nx-muted)]">
          Conflict policy: {storage.conflictPolicy}
        </p>
      )}
    </div>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-[var(--nx-muted)]">{label}</dt>
      <dd className="mt-1 break-all font-medium">{value}</dd>
    </div>
  );
}
