"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ShopSwitcher } from "@/components/shop-switcher";

const links = [
  { href: "/merchant", label: "Home" },
  { href: "/merchant/pending", label: "Confirm" },
  { href: "/merchant/payments", label: "Payments" },
  { href: "/merchant/reports", label: "Reports" },
  { href: "/merchant/insights", label: "Insights" },
  { href: "/merchant/inventory", label: "Inventory" },
  { href: "/merchant/loyalty", label: "Loyalty" },
  { href: "/merchant/shops", label: "Shops" },
  { href: "/merchant/storage", label: "Storage" },
  { href: "/merchant/receipts", label: "Receipts" },
  { href: "/merchant/tally", label: "Tally" },
  { href: "/merchant/onboarding", label: "Setup" },
];

function NavLinks({
  pathname,
  className,
}: {
  pathname: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {links.map((l) => {
        const active =
          l.href === "/merchant"
            ? pathname === "/merchant"
            : pathname === l.href || pathname.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "nx-tap inline-flex items-center rounded-md px-3 text-sm whitespace-nowrap",
              active
                ? "bg-[var(--nx-ink)] text-[var(--nx-paper)]"
                : "text-[var(--nx-muted)] hover:bg-[var(--nx-mist)] hover:text-[var(--nx-ink)]"
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}

export function MerchantNav() {
  const pathname = usePathname();
  const activeLabel =
    links.find((l) =>
      l.href === "/merchant"
        ? pathname === "/merchant"
        : pathname === l.href || pathname.startsWith(l.href + "/")
    )?.label ?? "Menu";

  return (
    <div className="relative z-20 mx-auto w-full max-w-5xl px-4 sm:px-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <details className="md:hidden">
          <summary className="nx-tap list-none inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--nx-line)] bg-white/70 px-3 text-sm font-medium text-[var(--nx-ink)] [&::-webkit-details-marker]:hidden">
            <span className="text-[var(--nx-muted)]">Nav</span>
            <span>{activeLabel}</span>
            <span aria-hidden className="text-[var(--nx-muted)]">
              ▾
            </span>
          </summary>
          <nav
            id="merchant-mobile-nav"
            data-merchant-nav
            className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-[var(--nx-line)] bg-white/90 p-2 backdrop-blur-sm"
          >
            <NavLinks pathname={pathname} className="contents" />
          </nav>
        </details>
        <div className="ml-auto">
          <ShopSwitcher />
        </div>
      </div>

      <nav data-merchant-nav className="hidden gap-1 overflow-x-auto pb-2 md:flex">
        <NavLinks pathname={pathname} className="flex gap-1" />
      </nav>
    </div>
  );
}
