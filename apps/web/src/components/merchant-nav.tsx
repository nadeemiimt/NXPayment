"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/merchant", label: "Home" },
  { href: "/merchant/pending", label: "Confirm" },
  { href: "/merchant/till", label: "Till" },
  { href: "/merchant/payments", label: "Payments" },
  { href: "/merchant/tally", label: "Tally" },
  { href: "/merchant/onboarding", label: "Setup" },
  { href: "/merchant/auto-confirm", label: "Auto-confirm" },
  { href: "/merchant/alerts", label: "Alerts" },
];

export function MerchantNav() {
  const pathname = usePathname();
  return (
    <nav className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-5 pb-2">
      {links.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm whitespace-nowrap",
              active
                ? "bg-[var(--nx-ink)] text-[var(--nx-paper)]"
                : "text-[var(--nx-muted)] hover:bg-[var(--nx-mist)] hover:text-[var(--nx-ink)]"
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
