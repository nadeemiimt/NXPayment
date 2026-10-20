"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Alert = {
  id: string;
  kind: string;
  severity: string;
  title: string;
  body: string | null;
  paymentId: string | null;
  read: number;
  createdAt: string;
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const r = await api.listAlerts();
      setAlerts(r.alerts as Alert[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load alerts");
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-3xl font-semibold">Alerts</h1>
      <p className="mt-2 text-[var(--nx-muted)]">
        High-risk payments, queue blocks, expired sessions, auto-confirm outcomes.
      </p>
      {error && <p className="mt-4 text-sm text-[#9B2C2C]">{error}</p>}
      <ul className="mt-8 space-y-3">
        {alerts.length === 0 && (
          <li className="text-sm text-[var(--nx-muted)]">No alerts yet.</li>
        )}
        {alerts.map((a) => (
          <li
            key={a.id}
            className="rounded-md border border-[var(--nx-line)] px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--nx-muted)]">
                  {a.severity} · {a.kind}
                </p>
                <p className="font-medium">{a.title}</p>
                {a.body && <p className="mt-1 text-sm text-[var(--nx-muted)]">{a.body}</p>}
                {a.paymentId && (
                  <p className="mt-1 font-mono text-xs">{a.paymentId}</p>
                )}
              </div>
              {!a.read && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void api.markAlertRead(a.id).then(load)}
                >
                  Mark read
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
