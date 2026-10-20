"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type MerchantConfig } from "@/lib/api";

export function SiteHeader({ tone = "default" }: { tone?: "default" | "minimal" }) {
  const [config, setConfig] = useState<MerchantConfig | null>(null);

  useEffect(() => {
    api
      .getConfig()
      .then((r) => setConfig(r.config))
      .catch(() => setConfig(null));
  }, []);

  const brand = config?.brandName?.trim() || "NXPayment";
  const hideChrome = Boolean(config?.hideNxChrome);
  const showNxTag = !hideChrome && tone === "default";

  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
      <Link href="/" className="group flex items-baseline gap-2">
        <span className="font-display text-2xl font-semibold tracking-tight text-[var(--nx-ink)]">
          {brand}
        </span>
        {showNxTag && brand !== "NXPayment" && (
          <span className="text-xs uppercase tracking-[0.18em] text-[var(--nx-muted)] group-hover:text-[var(--nx-accent)]">
            powered quietly
          </span>
        )}
        {showNxTag && brand === "NXPayment" && (
          <span className="text-xs uppercase tracking-[0.18em] text-[var(--nx-muted)] group-hover:text-[var(--nx-accent)]">
            direct UPI
          </span>
        )}
      </Link>
      {tone === "default" && (
        <nav className="flex items-center gap-4 text-sm text-[var(--nx-muted)]">
          <Link href="/checkout" className="hover:text-[var(--nx-ink)]">
            Checkout
          </Link>
          <Link href="/merchant" className="hover:text-[var(--nx-ink)]">
            Merchant
          </Link>
        </nav>
      )}
    </header>
  );
}
