"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type MerchantConfig } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const VPA_RE = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/;

export default function OnboardingPage() {
  const router = useRouter();
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
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getConfig()
      .then((r) => {
        setSaved(r.config);
        setForm({
          primaryVpa: r.config.primaryVpa,
          secondaryVpa: r.config.secondaryVpa ?? "",
          displayName: r.config.displayName,
          brandName: r.config.brandName,
          accentColor: r.config.accentColor?.trim() || "#0B6E4F",
          webhookUrl: r.config.webhookUrl ?? "",
        });
        setLoadError(null);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Could not load merchant config");
      });
  }, []);

  async function save() {
    setLoading(true);
    setError(null);
    setMessage(null);

    const primaryVpa = form.primaryVpa.trim();
    const displayName = form.displayName.trim();
    if (!VPA_RE.test(primaryVpa)) {
      setError("Enter a valid primary VPA (e.g. shop@upi).");
      setLoading(false);
      return;
    }
    if (!displayName) {
      setError("Display name is required.");
      setLoading(false);
      return;
    }
    if (form.secondaryVpa.trim() && !VPA_RE.test(form.secondaryVpa.trim())) {
      setError("Secondary VPA looks invalid (or leave it blank).");
      setLoading(false);
      return;
    }

    try {
      const body: Partial<MerchantConfig> = {
        primaryVpa,
        secondaryVpa: form.secondaryVpa.trim() || null,
        displayName,
        brandName: form.brandName.trim() || displayName,
        accentColor: form.accentColor.trim() || "#0B6E4F",
        webhookUrl: form.webhookUrl.trim() || null,
      };
      const { config } = await api.updateConfig(body);
      setSaved(config);
      setMessage("Saved. Opening pending confirms…");
      router.push("/merchant/pending");
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

      {loadError && (
        <p className="mt-4 rounded-md border border-[#9B2C2C]/40 bg-[#9B2C2C]/10 px-3 py-2 text-sm text-[#9B2C2C]">
          {loadError}
        </p>
      )}

      <div className="mt-8 space-y-4">
        <Field label="Primary UPI VPA">
          <Input
            value={form.primaryVpa}
            onChange={(e) => setForm({ ...form, primaryVpa: e.target.value })}
            placeholder="shop@upi"
            autoComplete="off"
          />
        </Field>
        <Field label="Secondary VPA (fallback)">
          <Input
            value={form.secondaryVpa}
            onChange={(e) => setForm({ ...form, secondaryVpa: e.target.value })}
            placeholder="optional@upi"
            autoComplete="off"
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
        {error && (
          <p
            role="alert"
            className="rounded-md border border-[#9B2C2C]/40 bg-[#9B2C2C]/10 px-3 py-2 text-sm text-[#9B2C2C]"
          >
            {error}
          </p>
        )}
        {message && <p className="text-sm text-[var(--nx-accent)]">{message}</p>}
        <Button type="button" size="lg" disabled={loading} onClick={() => void save()}>
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
