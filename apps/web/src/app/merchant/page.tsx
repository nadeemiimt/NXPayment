"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  api,
  type DisplaySession,
  type MerchantConfig,
  type Tally,
} from "@/lib/api";
import { formatInr } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function MerchantHome() {
  const [config, setConfig] = useState<MerchantConfig | null>(null);
  const [tally, setTally] = useState<Tally | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [sessions, setSessions] = useState<DisplaySession[]>([]);
  const [displayMsg, setDisplayMsg] = useState<string | null>(null);

  async function refresh() {
    const [c, t, p, d] = await Promise.all([
      api.getConfig(),
      api.tally(),
      api.pending(),
      api.listDisplaySessions(),
    ]);
    setConfig(c.config);
    setTally(t.tally);
    setPendingCount(p.payments.length);
    setSessions(d.sessions);
  }

  useEffect(() => {
    refresh().catch(() => undefined);
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div>
      <p className="text-sm uppercase tracking-[0.2em] text-[var(--nx-accent)]">Merchant</p>
      <h1 className="font-display mt-2 text-4xl font-semibold">
        {config?.brandName ?? "NXPayment"}
      </h1>
      <p className="mt-2 max-w-xl text-[var(--nx-muted)]">
        Confirm buyer payments that settle to{" "}
        <strong className="text-[var(--nx-ink)]">{config?.primaryVpa ?? "…"}</strong>.
        Software only — you reconcile your bank.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Pending confirms" value={String(pendingCount)} href="/merchant/pending" />
        <Stat
          label="Successful (range)"
          value={String(tally?.successCount ?? "—")}
          href="/merchant/reports"
        />
        <Stat
          label="Total sales"
          value={tally ? formatInr(tally.totalSalesPaise) : "—"}
          href="/merchant/reports"
        />
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/merchant/pending">Review pending</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/merchant/inventory">Inventory</Link>
        </Button>
        <Button asChild size="lg" variant="ghost">
          <Link href="/checkout">Open test checkout</Link>
        </Button>
      </div>

      <section className="mt-12 max-w-2xl">
        <h2 className="font-display text-2xl">Counter display</h2>
        <p className="mt-2 text-sm text-[var(--nx-muted)]">
          Pair a cheap phone or tablet: open the kiosk URL full-screen. It polls for the current open
          payment and shows amount + UPI QR.
        </p>
        <Button
          className="mt-4"
          type="button"
          onClick={async () => {
            const r = await api.createDisplaySession({ label: "Counter" });
            setDisplayMsg(`${origin}${r.session.urlPath}`);
            await refresh();
          }}
        >
          Generate display code
        </Button>
        {displayMsg && (
          <p className="mt-3 break-all text-sm">
            Open on tablet:{" "}
            <a className="text-[var(--nx-accent)] underline" href={displayMsg}>
              {displayMsg}
            </a>
          </p>
        )}
        {sessions[0] && !displayMsg && (
          <p className="mt-3 break-all text-sm text-[var(--nx-muted)]">
            Latest: {origin}
            {sessions[0].urlPath} (code {sessions[0].code})
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link
      href={href}
      className="block border-b border-[var(--nx-line)] px-1 py-4 transition hover:border-[var(--nx-accent)]"
    >
      <p className="text-xs uppercase tracking-wider text-[var(--nx-muted)]">{label}</p>
      <p className="font-display mt-2 text-3xl">{value}</p>
    </Link>
  );
}
