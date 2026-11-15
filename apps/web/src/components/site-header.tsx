"use client";

import Link from "next/link";
import { NxBrand } from "@/components/nx-logo";

export function SiteHeader({ tone = "default" }: { tone?: "default" | "minimal" }) {
  return (
    <header className="site-header relative z-20 mx-auto w-full max-w-5xl px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="group min-h-11 min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nx-accent)]"
        >
          <NxBrand size={36} showTagline={tone === "default"} className="gap-2.5 sm:gap-3" />
        </Link>

        {tone === "default" && (
          <>
            <nav className="hidden items-center gap-1 sm:flex">
              <Link
                href="/checkout"
                className="nx-tap inline-flex items-center rounded-md px-4 text-sm text-[var(--nx-muted)] transition-colors hover:bg-[var(--nx-mist)] hover:text-[var(--nx-ink)]"
              >
                Checkout
              </Link>
              <Link
                href="/merchant"
                className="nx-tap inline-flex items-center rounded-md px-4 text-sm text-[var(--nx-muted)] transition-colors hover:bg-[var(--nx-mist)] hover:text-[var(--nx-ink)]"
              >
                Merchant
              </Link>
            </nav>
            <details className="relative sm:hidden">
              <summary className="nx-tap list-none inline-flex cursor-pointer items-center justify-center rounded-md border border-[var(--nx-line)] bg-white/60 px-3 text-sm font-medium text-[var(--nx-ink)] [&::-webkit-details-marker]:hidden">
                Menu
              </summary>
              <nav
                id="site-mobile-nav"
                className="absolute right-0 z-30 mt-2 flex w-44 flex-col gap-1 rounded-lg border border-[var(--nx-line)] bg-white/95 p-2 shadow-sm backdrop-blur-sm"
              >
                <Link
                  href="/checkout"
                  className="nx-tap inline-flex items-center rounded-md px-4 text-sm text-[var(--nx-ink)] hover:bg-[var(--nx-mist)]"
                >
                  Checkout
                </Link>
                <Link
                  href="/merchant"
                  className="nx-tap inline-flex items-center rounded-md px-4 text-sm text-[var(--nx-ink)] hover:bg-[var(--nx-mist)]"
                >
                  Merchant
                </Link>
              </nav>
            </details>
          </>
        )}
      </div>
    </header>
  );
}
