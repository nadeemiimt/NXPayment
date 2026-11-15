"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { NxAtmosphere } from "@/components/nx-atmosphere";
import { NxLogo } from "@/components/nx-logo";
import { Button } from "@/components/ui/button";
import { api, type Payment, type PaymentStatus } from "@/lib/api";
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
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [qrSize, setQrSize] = useState(220);

  useEffect(() => {
    const update = () => {
      const w = typeof window !== "undefined" ? window.innerWidth : 400;
      setQrSize(w < 380 ? 180 : w < 480 ? 200 : 220);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
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
      <main className="relative min-h-screen overflow-x-hidden">
        <NxAtmosphere />
        <div className="relative z-10">
          <SiteHeader tone="minimal" />
          <p className="px-4 text-[#9B2C2C] sm:px-5">{error}</p>
        </div>
      </main>
    );
  }

  if (!payment) {
    return (
      <main className="relative min-h-screen overflow-x-hidden">
        <NxAtmosphere />
        <div className="relative z-10">
          <SiteHeader tone="minimal" />
          <p className="px-4 text-[var(--nx-muted)] sm:px-5">Loading checkout…</p>
        </div>
      </main>
    );
  }

  const copy = statusCopy(payment.status);
  const waiting = !TERMINAL.includes(payment.status);

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <NxAtmosphere />
      <div className="relative z-10">
        <SiteHeader tone="minimal" />
        <div className="mx-auto max-w-lg px-4 pb-20 sm:px-5">
          <div className="nx-rise mb-4 flex items-center gap-3">
            <NxLogo size={36} />
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--nx-accent)] sm:text-sm">
              NXPayment checkout
            </p>
          </div>
          <h1 className="nx-rise font-display text-4xl font-semibold tracking-tight text-[var(--nx-ink)] sm:text-5xl">
            {formatInr(payment.amountPaise)}
          </h1>
          <p className="mt-2 break-words text-[var(--nx-muted)]">
            to {payment.receivingName} ·{" "}
            <span className="break-all">{payment.receivingVpa}</span>
          </p>

          <div className="nx-rise mt-6 border-t border-[var(--nx-line)] pt-6 sm:mt-8">
            <h2 className="font-display text-xl sm:text-2xl">{copy.title}</h2>
            <p className="mt-2 text-sm text-[var(--nx-muted)]">{copy.body}</p>

            {waiting && (
              <>
                <div className="mt-6 flex justify-center rounded-xl bg-[var(--nx-mist)]/80 p-4 sm:p-6">
                  <QRCodeSVG
                    value={payment.upiUri}
                    size={qrSize}
                    level="M"
                    includeMargin
                    className="max-w-full"
                  />
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button asChild className="min-h-12 flex-1">
                    <a href={payment.upiUri}>Open UPI app</a>
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-12 flex-1"
                    onClick={() => navigator.clipboard.writeText(payment.upiUri)}
                  >
                    Copy UPI link
                  </Button>
                </div>
                <div className="mt-6 flex items-center gap-3 text-sm text-[var(--nx-muted)]">
                  <span className="nx-wait-dot inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--nx-accent)]" />
                  Waiting for merchant to confirm this amount
                </div>
                <p className="mt-2 text-xs text-[var(--nx-muted)]">
                  Session expires in {Math.ceil(remainingMs / 1000)}s
                </p>
              </>
            )}

            {payment.status === "SUCCESS" && (
              <div className="mt-6 rounded-xl bg-[var(--nx-mist)]/80 px-4 py-5 text-center">
                <p className="font-display text-3xl text-[var(--nx-accent)]">Success</p>
                <p className="mt-1 text-sm text-[var(--nx-muted)]">
                  Confirmed{" "}
                  {payment.confirmedAt ? new Date(payment.confirmedAt).toLocaleString() : ""}
                </p>
              </div>
            )}

            {(payment.status === "EXPIRED" || payment.status === "FAILED") && (
              <Button asChild className="mt-6 w-full min-h-12" variant="outline">
                <Link href="/checkout">Start a new payment</Link>
              </Button>
            )}
          </div>

          <p className="mt-6 break-all text-center text-xs text-[var(--nx-muted)]">
            Status: {payment.status} · id {payment.id}
          </p>
        </div>
      </div>
    </main>
  );
}
