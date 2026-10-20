"use client";

import { useEffect, useState } from "react";
import { api, type Tally } from "@/lib/api";
import { formatInr } from "@/lib/utils";

export default function TallyPage() {
  const [tally, setTally] = useState<Tally | null>(null);
  const [gstStub, setGstStub] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .tally()
      .then((r) => setTally(r.tally))
      .catch((e) => setError(e.message));
  }, []);

  async function probeGst() {
    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3847";
    const res = await fetch(`${API_URL}/api/reports/gst-export`);
    const data = await res.json();
    setGstStub(data.message ?? JSON.stringify(data));
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Tally</h1>
      <p className="mt-2 text-[var(--nx-muted)]">
        Success / failed / sales for the last 30 days. Room for GST & reconciliation later.
      </p>
      {error && <p className="mt-3 text-sm text-[#9B2C2C]">{error}</p>}

      {tally && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Success" value={String(tally.successCount)} />
          <Metric label="Failed" value={String(tally.failedCount)} />
          <Metric label="Expired" value={String(tally.expiredCount)} />
          <Metric label="Total sales" value={formatInr(tally.totalSalesPaise)} accent />
        </div>
      )}

      <div className="mt-10 rounded-xl border border-dashed border-[var(--nx-line)] p-5">
        <h2 className="font-display text-xl">Future reports</h2>
        <p className="mt-1 text-sm text-[var(--nx-muted)]">
          GST API export and bank reconciliation are extension stubs only — not integrated.
        </p>
        <button
          type="button"
          className="mt-4 text-sm font-medium text-[var(--nx-accent)] underline-offset-2 hover:underline"
          onClick={probeGst}
        >
          Probe GST export stub
        </button>
        {gstStub && <p className="mt-2 text-sm text-[var(--nx-muted)]">{gstStub}</p>}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--nx-line)] bg-white/60 px-4 py-5">
      <p className="text-xs uppercase tracking-wider text-[var(--nx-muted)]">{label}</p>
      <p
        className={`font-display mt-2 text-3xl ${accent ? "text-[var(--nx-accent)]" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
