"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type PendingAssistRow } from "@/lib/api";
import { formatInr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function confidenceTone(c: string): string {
  if (c === "high") return "text-[#1B7A3D]";
  if (c === "medium") return "text-[#9A6B00]";
  return "text-[var(--nx-muted)]";
}

export default function PendingPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PendingAssistRow[]>([]);
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creditInr, setCreditInr] = useState("");
  const [utr, setUtr] = useState("");

  const refresh = useCallback(async () => {
    const r = await api.pendingAssist();
    setRows(r.payments);
    setNote(r.note);
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const t = setInterval(() => refresh().catch(() => {}), 2000);
    return () => clearInterval(t);
  }, [refresh]);

  async function act(row: PendingAssistRow, kind: "confirm" | "reject") {
    setBusyId(row.payment.id);
    setError(null);
    try {
      if (kind === "confirm") {
        await api.confirm(row.payment.id, {
          creditId: row.assist.creditId ?? undefined,
        });
        router.push(`/merchant/receipts/${row.payment.id}`);
        return;
      }
      await api.reject(row.payment.id, "Rejected by merchant");
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
        Smart assist scores observed credits vs open payments (amount, time, UTR). Confirm only
        when you see the bank credit — settlement stays on your VPA.
      </p>
      {note && <p className="mt-2 text-xs text-[var(--nx-muted)]">{note}</p>}
      {error && <p className="mt-3 text-sm text-[#9B2C2C]">{error}</p>}

      <form
        className="mt-6 flex max-w-xl flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const amountPaise = Math.round(Number(creditInr) * 100);
          if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
            setError("Enter a valid credit amount");
            return;
          }
          try {
            await api.recordObservedCredit({
              amountPaise,
              utr: utr.trim() || null,
              source: "manual",
            });
            setCreditInr("");
            setUtr("");
            await refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to record credit");
          }
        }}
      >
        <Input
          type="number"
          step="0.01"
          placeholder="Observed credit ₹"
          value={creditInr}
          onChange={(e) => setCreditInr(e.target.value)}
          required
        />
        <Input
          placeholder="UTR (optional)"
          value={utr}
          onChange={(e) => setUtr(e.target.value)}
        />
        <Button type="submit" variant="outline">
          Log credit
        </Button>
      </form>

      <div className="mt-8 space-y-4">
        {rows.length === 0 && (
          <p className="rounded-xl border border-dashed border-[var(--nx-line)] px-4 py-10 text-center text-[var(--nx-muted)]">
            No payments waiting. Open checkout to create a test payment.
          </p>
        )}
        {rows.map(({ payment: p, assist }) => (
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
                <p className={`mt-2 text-sm font-medium ${confidenceTone(assist.confidence)}`}>
                  Match {assist.confidence} · score {assist.score}
                  {assist.recommendConfirm ? " · suggest confirm" : ""}
                </p>
                {assist.sameAmountCollision && (
                  <p className="mt-1 text-sm text-[#9B2C2C]">
                    Same-amount collision — {assist.sameAmountCount} open payments at this ₹.
                    Verify carefully before confirm.
                  </p>
                )}
                <p className="mt-1 text-xs text-[var(--nx-muted)]">
                  {assist.reasons.join(" · ")}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="lg"
                  disabled={busyId === p.id}
                  onClick={() => act({ payment: p, assist }, "confirm")}
                >
                  Confirm & print
                </Button>
                <Button
                  size="lg"
                  variant="danger"
                  disabled={busyId === p.id}
                  onClick={() => act({ payment: p, assist }, "reject")}
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
