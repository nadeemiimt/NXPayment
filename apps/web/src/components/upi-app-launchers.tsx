"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  buildUpiProviderLinks,
  detectClientPlatform,
  resolveUpiLaunchHref,
  type UpiProviderId,
} from "@/lib/upi-providers";
import { cn } from "@/lib/utils";

const PRIMARY: UpiProviderId[] = ["phonepe", "gpay", "paytm"];

const ACCENT: Record<string, string> = {
  phonepe: "border-[#5f259f]/40 hover:border-[#5f259f] hover:bg-[#5f259f]/08",
  gpay: "border-[#4285f4]/40 hover:border-[#4285f4] hover:bg-[#4285f4]/08",
  paytm: "border-[#00baf2]/40 hover:border-[#00baf2] hover:bg-[#00baf2]/08",
};

export function UpiAppLaunchers({ upiUri }: { upiUri: string }) {
  const [copied, setCopied] = useState(false);
  const platform = useMemo(
    () =>
      typeof navigator !== "undefined"
        ? detectClientPlatform(navigator.userAgent)
        : "desktop",
    []
  );
  const links = useMemo(() => buildUpiProviderLinks(upiUri), [upiUri]);
  const primary = links.filter((l) => PRIMARY.includes(l.id));
  const generic = links.find((l) => l.id === "generic");

  function launch(id: UpiProviderId) {
    const provider = links.find((l) => l.id === id);
    if (!provider) return;
    const href = resolveUpiLaunchHref(
      provider,
      typeof navigator !== "undefined" ? navigator.userAgent : ""
    );
    window.location.href = href;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(upiUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-5 space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--nx-muted)]">
        {platform === "android"
          ? "Open in your UPI app"
          : platform === "ios"
            ? "Scan QR or open if the app is installed"
            : "On phone: scan QR · desktop: copy link"}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {primary.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => launch(p.id)}
            className={cn(
              "nx-cta rounded-md border bg-white/80 px-3 py-3 text-sm font-semibold text-[var(--nx-ink)]",
              ACCENT[p.id]
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {generic && (
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => launch("generic")}
          >
            Open UPI app
          </Button>
        )}
        <Button variant="outline" className="flex-1" onClick={copyLink}>
          {copied ? "Copied" : "Copy UPI link"}
        </Button>
      </div>
    </div>
  );
}
