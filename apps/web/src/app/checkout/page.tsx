"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
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
    <main className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-lg px-5 pb-16 pt-4">
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--nx-accent)]">
          SimpleCheckout
        </p>
        <h1 className="font-display mt-2 text-4xl font-semibold text-[var(--nx-ink)]">
          Pay {config?.displayName ?? "merchant"}
        </h1>
        <p className="mt-2 text-[var(--nx-muted)]">
          Funds go directly to{" "}
          <span className="font-medium text-[var(--nx-ink)]">
            {config?.primaryVpa ?? "merchant VPA"}
          </span>
          . NXPayment never holds the money.
        </p>

        <div className="mt-8 space-y-4">
          <label className="block text-sm font-medium">
            Amount (₹)
            <Input
              className="mt-1.5"
              inputMode="decimal"
              value={rupees}
              onChange={(e) => setRupees(e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Order reference (optional)
            <Input
              className="mt-1.5"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="ORD-1042"
            />
          </label>
          <label className="block text-sm font-medium">
            Note (optional)
            <Input
              className="mt-1.5"
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
          <div className="flex gap-2">
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
