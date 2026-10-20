"use client";

import { useEffect, useState } from "react";
import { api, type MerchantConfig } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function OnboardingPage() {
  const [form, setForm] = useState({
    primaryVpa: "",
    secondaryVpa: "",
    displayName: "",
    brandName: "",
    accentColor: "#0B6E4F",
    webhookUrl: "",
  });
  const [saved, setSaved] = useState<MerchantConfig | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getConfig().then((r) => {
      setSaved(r.config);
      setForm({
        primaryVpa: r.config.primaryVpa,
        secondaryVpa: r.config.secondaryVpa ?? "",
        displayName: r.config.displayName,
        brandName: r.config.brandName,
        accentColor: r.config.accentColor,
        webhookUrl: r.config.webhookUrl ?? "",
      });
    });
  }, []);

  async function save() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const { config } = await api.updateConfig({
        primaryVpa: form.primaryVpa,
        secondaryVpa: form.secondaryVpa || null,
        displayName: form.displayName,
        brandName: form.brandName,
        accentColor: form.accentColor,
        webhookUrl: form.webhookUrl || null,
      });
      setSaved(config);
      setMessage("Saved. Try a ₹1 test payment from checkout, then Confirm.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="font-display text-3xl font-semibold">Go-live setup</h1>
      <p className="mt-2 text-[var(--nx-muted)]">
        VPA → branding → test payment. Money settles to your account; NXPayment is software.
      </p>

      <div className="mt-8 space-y-4">
        <Field label="Primary UPI VPA">
          <Input
            value={form.primaryVpa}
            onChange={(e) => setForm({ ...form, primaryVpa: e.target.value })}
            placeholder="shop@upi"
          />
        </Field>
        <Field label="Secondary VPA (fallback)">
          <Input
            value={form.secondaryVpa}
            onChange={(e) => setForm({ ...form, secondaryVpa: e.target.value })}
            placeholder="optional@upi"
          />
        </Field>
        <Field label="Display name (UPI pn=)">
          <Input
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
        </Field>
        <Field label="Brand name">
          <Input
            value={form.brandName}
            onChange={(e) => setForm({ ...form, brandName: e.target.value })}
          />
        </Field>
        <Field label="Accent color">
          <Input
            value={form.accentColor}
            onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
          />
        </Field>
        <Field label="Webhook URL (optional)">
          <Input
            value={form.webhookUrl}
            onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
            placeholder="https://your.store/hooks/nxpayment"
          />
        </Field>
        {error && <p className="text-sm text-[#9B2C2C]">{error}</p>}
        {message && <p className="text-sm text-[var(--nx-accent)]">{message}</p>}
        <Button size="lg" disabled={loading} onClick={save}>
          {loading ? "Saving…" : "Save & continue"}
        </Button>
      </div>

      {saved && (
        <p className="mt-6 text-xs text-[var(--nx-muted)]">
          TTL {Math.round(saved.paymentTtlMs / 1000)}s · updated {saved.updatedAt}
        </p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
