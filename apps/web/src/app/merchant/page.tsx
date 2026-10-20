"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type MerchantConfig, type Tally } from "@/lib/api";
import { formatInr } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function MerchantHome() {
  const [config, setConfig] = useState<MerchantConfig | null>(null);
  const [tally, setTally] = useState<Tally | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    Promise.all([api.getConfig(), api.tally(), api.pending()]).then(
      ([c, t, p]) => {
        setConfig(c.config);
        setTally(t.tally);
        setPendingCount(p.payments.length);
      }
    );
  }, []);

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
          label="Successful today-range"
          value={String(tally?.successCount ?? "—")}
          href="/merchant/tally"
        />
        <Stat
          label="Total sales"
          value={tally ? formatInr(tally.totalSalesPaise) : "—"}
          href="/merchant/tally"
        />
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/merchant/pending">Review pending</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/merchant/till">Till desk</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/merchant/onboarding">VPA & branding</Link>
        </Button>
        <Button asChild size="lg" variant="ghost">
          <Link href="/checkout">Open test checkout</Link>
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-[var(--nx-line)] bg-white/60 px-4 py-5 transition hover:border-[var(--nx-accent)]"
    >
      <p className="text-xs uppercase tracking-wider text-[var(--nx-muted)]">{label}</p>
      <p className="font-display mt-2 text-3xl">{value}</p>
    </Link>
  );
}
