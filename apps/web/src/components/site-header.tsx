import Link from "next/link";

export function SiteHeader({ tone = "default" }: { tone?: "default" | "minimal" }) {
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
      <Link href="/" className="group flex items-baseline gap-2">
        <span className="font-display text-2xl font-semibold tracking-tight text-[var(--nx-ink)]">
          NXPayment
        </span>
        {tone === "default" && (
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
