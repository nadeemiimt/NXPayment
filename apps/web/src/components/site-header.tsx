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

  const merchantBrand = config?.brandName?.trim() || "";
  const hideChrome = Boolean(config?.hideNxChrome);
  const showNx = !hideChrome;
  const title = hideChrome && merchantBrand ? merchantBrand : "NXPayment";

  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
      <Link href="/" className="group flex items-baseline gap-2">
        <span className="font-display text-2xl font-semibold tracking-tight text-[var(--nx-ink)]">
          {title}
        </span>
        {showNx && merchantBrand && merchantBrand !== "NXPayment" && (
          <span className="text-xs uppercase tracking-[0.18em] text-[var(--nx-muted)] group-hover:text-[var(--nx-accent-dark)]">
            {merchantBrand}
          </span>
        )}
        {showNx && (!merchantBrand || merchantBrand === "NXPayment") && (
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--nx-accent-dark)]">
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
