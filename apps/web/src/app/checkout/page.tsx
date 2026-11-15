"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { NxAtmosphere } from "@/components/nx-atmosphere";
import { NxLogo } from "@/components/nx-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, type MerchantConfig, type Payment } from "@/lib/api";
import { formatInr } from "@/lib/utils";

export default function CheckoutStartPage() {
  const router = useRouter();
  const [config, setConfig] = useState<MerchantConfig | null>(null);
  const [rupees, setRupees] = useState("100");
  const [orderId, setOrderId] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [existing, setExisting] = useState<Payment[]>([]);

  useEffect(() => {
    api.getConfig().then((r) => setConfig(r.config)).catch(() => setConfig(null));
  }, []);

  async function create(confirmDuplicate = false) {
    setLoading(true);
    setError(null);
    const amountPaise = Math.round(Number(rupees) * 100);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      setError("Enter a valid amount in rupees");
      setLoading(false);
      return;
    }
    try {
      const { payment } = await api.createPayment({
        amountPaise,
        merchantOrderId: orderId || undefined,
        note: note || undefined,
        confirmDuplicate,
        idempotencyKey: confirmDuplicate
          ? undefined
          : `web-${amountPaise}-${Date.now()}`,
      });
      setDupOpen(false);
      router.push(`/checkout/${payment.id}`);
    } catch (err) {
      const e = err as Error & {
        status?: number;
        body?: { existing?: Payment[]; message?: string; requireConfirmDuplicate?: boolean };
      };
      if (e.status === 409) {
        setExisting(e.body?.existing ?? []);
        setDupOpen(true);
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <NxAtmosphere />
      <div className="relative z-10">
        <SiteHeader />
        <div className="mx-auto max-w-lg px-4 pb-16 pt-2 sm:px-5 sm:pt-4">
          <div className="nx-rise mb-5 flex items-center gap-3">
            <NxLogo size={40} />
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--nx-accent)] sm:text-sm">
                NXPayment · SimpleCheckout
              </p>
              <h1 className="font-display mt-1 text-3xl font-semibold leading-tight text-[var(--nx-ink)] sm:text-4xl">
                Pay {config?.displayName ?? "merchant"}
              </h1>
            </div>
          </div>
          <p className="nx-rise text-[var(--nx-muted)]" style={{ animationDelay: "60ms" }}>
            Funds go directly to{" "}
            <span className="break-all font-medium text-[var(--nx-ink)]">
              {config?.primaryVpa ?? "merchant VPA"}
            </span>
            . NXPayment never holds the money.
          </p>

          <div
            className="nx-rise mt-8 space-y-4"
            style={{ animationDelay: "120ms" }}
          >
            <label className="block text-sm font-medium">
              Amount (₹)
              <Input
                className="mt-1.5 h-12 text-base"
                inputMode="decimal"
                value={rupees}
                onChange={(e) => setRupees(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              Order reference (optional)
              <Input
                className="mt-1.5 h-12 text-base"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="ORD-1042"
              />
            </label>
            <label className="block text-sm font-medium">
              Note (optional)
              <Input
                className="mt-1.5 h-12 text-base"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Table 4"
              />
            </label>
            {error && <p className="text-sm text-[#9B2C2C]">{error}</p>}
            <Button className="w-full" size="lg" disabled={loading} onClick={() => create(false)}>
              {loading ? "Creating…" : "Continue to UPI"}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Same amount already in progress</DialogTitle>
            <DialogDescription>
              Another payment for {formatInr(Math.round(Number(rupees) * 100) || 0)} is waiting
              for merchant confirmation. Start another only if this is intentional.
            </DialogDescription>
          </DialogHeader>
          {existing[0] && (
            <p className="mb-4 rounded-md bg-[var(--nx-mist)] px-3 py-2 text-sm">
              Existing: {existing[0].id.slice(0, 8)}… · {existing[0].status}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="flex-1" onClick={() => setDupOpen(false)}>
              Cancel
            </Button>
            <Button className="flex-1" disabled={loading} onClick={() => create(true)}>
              Start anyway
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
