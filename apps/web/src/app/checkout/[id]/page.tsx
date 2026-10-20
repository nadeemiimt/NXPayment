"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { api, type MerchantConfig, type Payment, type PaymentStatus } from "@/lib/api";
import { formatInr } from "@/lib/utils";

const TERMINAL: PaymentStatus[] = ["SUCCESS", "FAILED", "EXPIRED", "CANCELLED"];

function statusCopy(status: PaymentStatus): { title: string; body: string } {
  switch (status) {
    case "ACTIVE":
      return {
        title: "Waiting for merchant confirmation",
        body: "Pay with any UPI app, then hang tight — the merchant will confirm this amount.",
      };
    case "PROCESSING":
      return {
        title: "Merchant is confirming…",
        body: "Almost there. Do not close this page.",
      };
    case "SUCCESS":
      return {
        title: "Payment confirmed",
        body: "The merchant confirmed this payment. Funds settled to their UPI account.",
      };
    case "FAILED":
      return {
        title: "Payment not confirmed",
        body: "The merchant rejected or could not match this payment.",
      };
    case "EXPIRED":
      return {
        title: "Payment timed out",
        body: "This session took too long and expired. Ask the merchant to start a new one if you still need to pay.",
      };
    case "CANCELLED":
      return { title: "Payment cancelled", body: "This checkout was cancelled." };
    default:
      return { title: status, body: "" };
  }
}

export default function CheckoutStatusPage() {
  const params = useParams<{ id: string }>();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [config, setConfig] = useState<MerchantConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    api.getConfig().then((r) => setConfig(r.config)).catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const { payment: p } = await api.getPayment(params.id);
        if (alive) setPayment(p);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load");
      }
    };
    tick();
    const poll = setInterval(tick, 1500);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [params.id]);

  const remainingMs = useMemo(() => {
    if (!payment) return 0;
    return Math.max(0, new Date(payment.expiresAt).getTime() - now);
  }, [payment, now]);

  if (error) {
    return (
      <main className="min-h-screen">
        <SiteHeader tone="minimal" />
        <p className="px-5 text-[#9B2C2C]">{error}</p>
      </main>
    );
  }

  if (!payment) {
    return (
      <main className="min-h-screen">
        <SiteHeader tone="minimal" />
        <p className="px-5 text-[var(--nx-muted)]">Loading checkout…</p>
      </main>
    );
  }

  const copy = statusCopy(payment.status);
  const waiting = !TERMINAL.includes(payment.status);
  const hideChrome = Boolean(config?.hideNxChrome);
  const brand = config?.brandName?.trim() || "Checkout";

  return (
    <main className="min-h-screen">
      <SiteHeader tone="minimal" />
      <div className="mx-auto max-w-lg px-5 pb-20">
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--nx-accent)]">
          {hideChrome ? brand : `${brand} checkout`}
        </p>
        <h1 className="font-display mt-2 text-4xl font-semibold">{formatInr(payment.amountPaise)}</h1>
        <p className="mt-1 text-[var(--nx-muted)]">
          to {payment.receivingName} · {payment.receivingVpa}
        </p>

        <div className="nx-rise mt-8 rounded-2xl border border-[var(--nx-line)] bg-white/70 p-6 backdrop-blur-sm">
          <h2 className="font-display text-2xl">{copy.title}</h2>
          <p className="mt-2 text-sm text-[var(--nx-muted)]">{copy.body}</p>

          {waiting && (
            <>
              <div className="mt-6 flex justify-center rounded-xl bg-[var(--nx-mist)] p-6">
                <QRCodeSVG value={payment.upiUri} size={200} level="M" includeMargin />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild className="flex-1">
                  <a href={payment.upiUri}>Open UPI app</a>
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigator.clipboard.writeText(payment.upiUri)}
                >
                  Copy UPI link
                </Button>
              </div>
              <div className="mt-6 flex items-center gap-3 text-sm text-[var(--nx-muted)]">
                <span className="nx-wait-dot inline-block h-2.5 w-2.5 rounded-full bg-[var(--nx-accent)]" />
                Waiting for merchant to confirm this amount
              </div>
              <p className="mt-2 text-xs text-[var(--nx-muted)]">
                Session expires in {Math.ceil(remainingMs / 1000)}s
              </p>
            </>
          )}

          {payment.status === "SUCCESS" && (
            <div className="mt-6 rounded-xl bg-[var(--nx-mist)] px-4 py-5 text-center">
              <p className="font-display text-3xl text-[var(--nx-accent)]">Success</p>
              <p className="mt-1 text-sm text-[var(--nx-muted)]">
                Confirmed {payment.confirmedAt ? new Date(payment.confirmedAt).toLocaleString() : ""}
              </p>
            </div>
          )}

          {(payment.status === "EXPIRED" || payment.status === "FAILED") && (
            <Button asChild className="mt-6 w-full" variant="outline">
              <Link href="/checkout">Start a new payment</Link>
            </Button>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-[var(--nx-muted)]">
          Status: {payment.status} · id {payment.id}
        </p>
      </div>
    </main>
  );
}
