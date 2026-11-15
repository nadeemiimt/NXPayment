"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { api, type DisplayState } from "@/lib/api";
import { formatInr } from "@/lib/utils";

export default function DisplayKioskPage() {
  const params = useParams<{ code: string }>();
  const [display, setDisplay] = useState<DisplayState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await api.getDisplay(params.code);
        if (alive) {
          setDisplay(r.display);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Unavailable");
      }
    };
    tick();
    const poll = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, [params.code]);

  if (error) {
    return (
      <main className="kiosk-root flex min-h-screen items-center justify-center px-6 text-center">
        <p className="text-lg text-[#f0d9a8]">{error}</p>
      </main>
    );
  }

  if (!display) {
    return (
      <main className="kiosk-root flex min-h-screen items-center justify-center">
        <div className="kiosk-pulse h-4 w-4 rounded-full bg-[#c4f06a]" />
      </main>
    );
  }

  const statusLabel =
    display.status === "waiting"
      ? "Waiting for payment"
      : display.status === "paid"
        ? "Paid"
        : display.status === "expired"
          ? "Expired"
          : display.status === "failed"
            ? "Not confirmed"
            : "Ready for next payment";

  return (
    <main className="kiosk-root relative min-h-screen overflow-hidden">
      <div className="kiosk-glow" aria-hidden />
      <div className="kiosk-grid" aria-hidden />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col px-5 py-8 sm:px-10">
        <header className="kiosk-rise flex items-end justify-between gap-4">
          <div>
            <p className="font-kiosk-brand text-4xl font-semibold tracking-tight text-[#f4ffe8] sm:text-6xl">
              {display.brandName}
            </p>
            <p className="mt-2 text-sm uppercase tracking-[0.25em] text-[#9cb89a]">
              {display.shopName ?? display.merchantName}
            </p>
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#6f8f6d]">
            Display {display.code}
          </p>
        </header>

        <section className="kiosk-rise mt-auto flex flex-1 flex-col items-center justify-center pb-10 pt-8 text-center">
          <p
            className={`text-sm uppercase tracking-[0.35em] ${
              display.status === "paid"
                ? "text-[#c4f06a]"
                : display.status === "waiting"
                  ? "text-[#f0d9a8] kiosk-pulse-text"
                  : "text-[#9cb89a]"
            }`}
          >
            {statusLabel}
          </p>

          <p className="font-kiosk-amount mt-4 text-[clamp(3.5rem,16vw,9rem)] font-semibold leading-none tracking-tight text-[#f4ffe8]">
            {display.amountPaise != null ? formatInr(display.amountPaise) : "—"}
          </p>

          {display.status === "waiting" && display.payment?.upiUri ? (
            <div className="mt-10 rounded-2xl bg-[#f4ffe8] p-4">
              <QRCodeSVG value={display.payment.upiUri} size={220} level="M" includeMargin />
            </div>
          ) : (
            <div className="mt-10 flex h-[236px] w-[236px] items-center justify-center rounded-2xl border border-dashed border-[#3d5a3c] text-sm text-[#6f8f6d]">
              {display.status === "idle" ? "Waiting for counter…" : "QR cleared"}
            </div>
          )}

          <p className="mt-8 max-w-md text-sm text-[#9cb89a]">
            Pay to the merchant’s UPI. NXPayment does not hold funds.
          </p>
        </section>
      </div>
    </main>
  );
}
