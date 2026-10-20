"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Payment } from "@/lib/api";
import { formatInr } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function PendingPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { payments: p } = await api.pending();
    setPayments(p);
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const t = setInterval(() => refresh().catch(() => {}), 2000);
    return () => clearInterval(t);
  }, [refresh]);

  async function act(id: string, kind: "confirm" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      if (kind === "confirm") await api.confirm(id);
      else await api.reject(id, "Rejected by merchant");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Pending confirms</h1>
      <p className="mt-2 text-[var(--nx-muted)]">
        Buyer already paid (or will pay) to your VPA. Confirm only when you see the credit —
        or trust your till.
      </p>
      {error && <p className="mt-3 text-sm text-[#9B2C2C]">{error}</p>}

      <div className="mt-8 space-y-4">
        {payments.length === 0 && (
          <p className="rounded-xl border border-dashed border-[var(--nx-line)] px-4 py-10 text-center text-[var(--nx-muted)]">
            No payments waiting. Open checkout to create a test payment.
          </p>
        )}
        {payments.map((p) => (
          <article
            key={p.id}
            className="rounded-2xl border border-[var(--nx-line)] bg-white/70 p-5 sm:p-6"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-[var(--nx-muted)]">
                  Confirm this amount
                </p>
                <p className="font-display mt-1 text-4xl font-semibold sm:text-5xl">
                  {formatInr(p.amountPaise)}
                </p>
                <p className="mt-2 text-sm text-[var(--nx-muted)]">
                  {p.note || p.merchantOrderId || p.id} · {p.status} · expires{" "}
                  {new Date(p.expiresAt).toLocaleTimeString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="lg"
                  disabled={busyId === p.id}
                  onClick={() => act(p.id, "confirm")}
                >
                  Confirm
                </Button>
                <Button
                  size="lg"
                  variant="danger"
                  disabled={busyId === p.id}
                  onClick={() => act(p.id, "reject")}
                >
                  Reject
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
