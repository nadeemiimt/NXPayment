"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Payment } from "@/lib/api";
import { formatInr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function TillDeskPage() {
  const [rupees, setRupees] = useState("100");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<"cash" | "card_counter">("cash");
  const [confirmNow, setConfirmNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<Payment | null>(null);
  const [open, setOpen] = useState<Payment[]>([]);

  const refresh = useCallback(async () => {
    const r = await api.listOpenTill();
    setOpen(r.payments);
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
    const t = setInterval(() => refresh().catch(() => {}), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  async function record() {
    setBusy(true);
    setError(null);
    const amountPaise = Math.round(Number(rupees) * 100);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      setError("Enter a valid amount");
      setBusy(false);
      return;
    }
    try {
      const { payment } = await api.createTillSale({
        amountPaise,
        method,
        note: note || undefined,
        confirm: confirmNow,
      });
      setLast(payment);
      setNote("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Till sale failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmOpen(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.confirmTillSale(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confirm failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="font-display text-3xl font-semibold">Till desk</h1>
      <p className="mt-2 text-[var(--nx-muted)]">
        Record offline Cash or Card-at-counter sales. No UPI QR — cashier confirm is the source
        of truth (manual Confirm still applies if left open).
      </p>

      <div className="mt-8 space-y-4">
        <label className="block text-sm font-medium">
          Amount (₹)
          <Input
            className="mt-1.5"
            inputMode="decimal"
            value={rupees}
            onChange={(e) => setRupees(e.target.value)}
          />
        </label>
        <fieldset>
          <legend className="text-sm font-medium">Method</legend>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              variant={method === "cash" ? "default" : "outline"}
              onClick={() => setMethod("cash")}
            >
              Cash
            </Button>
            <Button
              type="button"
              variant={method === "card_counter" ? "default" : "outline"}
              onClick={() => setMethod("card_counter")}
            >
              Card at counter
            </Button>
          </div>
        </fieldset>
        <label className="block text-sm font-medium">
          Note (optional)
          <Input
            className="mt-1.5"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Counter 2"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmNow}
            onChange={(e) => setConfirmNow(e.target.checked)}
          />
          Confirm now (cash/card already taken)
        </label>
        {error && <p className="text-sm text-[#9B2C2C]">{error}</p>}
        {last && (
          <p className="rounded-md bg-[var(--nx-mist)] px-3 py-2 text-sm">
            Last: {formatInr(last.amountPaise)} · {last.method} · {last.status}
          </p>
        )}
        <Button type="button" size="lg" disabled={busy} onClick={() => void record()}>
          {busy ? "Saving…" : confirmNow ? "Record & confirm" : "Record open sale"}
        </Button>
      </div>

      {open.length > 0 && (
        <div className="mt-10">
          <h2 className="font-display text-xl font-semibold">Open till sales</h2>
          <ul className="mt-4 space-y-3">
            {open.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-md border border-[var(--nx-line)] px-4 py-3"
              >
                <div>
                  <p className="font-medium">{formatInr(p.amountPaise)}</p>
                  <p className="text-xs text-[var(--nx-muted)]">
                    {p.method} · {p.note || p.id}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => void confirmOpen(p.id)}
                >
                  Confirm
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
