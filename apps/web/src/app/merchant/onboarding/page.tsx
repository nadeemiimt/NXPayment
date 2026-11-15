"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type AgentKeyPublic,
  type MerchantConfig,
  type ProviderSettings,
} from "@/lib/api";
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
  const [providers, setProviders] = useState<ProviderSettings | null>(null);
  const [agentsEnabled, setAgentsEnabled] = useState(false);
  const [hasActiveKey, setHasActiveKey] = useState(false);
  const [keys, setKeys] = useState<AgentKeyPublic[]>([]);
  const [freshApiKey, setFreshApiKey] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshExtras = useCallback(async () => {
    const [p, a] = await Promise.all([api.getProviders(), api.getAgents()]);
    setProviders(p.providers);
    setAgentsEnabled(a.agentsEnabled);
    setHasActiveKey(a.hasActiveKey);
    setKeys(a.keys);
  }, []);

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
    refreshExtras().catch(() => undefined);
  }, [refreshExtras]);

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

  async function patchProviders(body: Parameters<typeof api.updateProviders>[0]) {
    setError(null);
    try {
      const { providers: next } = await api.updateProviders(body);
      setProviders(next);
      setAgentsEnabled(next.agentsEnabled);
      setMessage("Payment settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function toggleAgents(on: boolean) {
    await patchProviders({ agentsEnabled: on });
    if (!on) {
      setFreshApiKey(null);
      await api.revokeAllAgentKeys().catch(() => undefined);
      await refreshExtras();
    }
  }

  async function createKey() {
    setError(null);
    try {
      const res = await api.createAgentKey();
      setFreshApiKey(res.apiKey);
      setAgentsEnabled(true);
      await refreshExtras();
      setMessage("API key created — copy it now. It will not be shown again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create key");
    }
  }

  async function revokeKey(id: string) {
    await api.revokeAgentKey(id);
    setFreshApiKey(null);
    await refreshExtras();
  }

  const bothEnabled =
    !!providers &&
    ((providers.upiEnabled ? 1 : 0) +
      (providers.cardsEnabled ? 1 : 0) +
      (providers.otherEnabled ? 1 : 0) >=
      2);

  return (
    <div className="max-w-lg pb-16">
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

      <section className="mt-12 border-t border-[var(--nx-mist)] pt-8">
        <h2 className="font-display text-xl font-semibold">How customers pay</h2>
        <p className="mt-1 text-sm text-[var(--nx-muted)]">
          UPI is on by default. Cards are coming soon — no maze of settings.
        </p>
        <div className="mt-4 space-y-3">
          <ToggleRow
            label="UPI (direct to your VPA)"
            hint="Recommended — no licensed PA needed"
            checked={providers?.upiEnabled ?? true}
            onChange={(on) => patchProviders({ upiEnabled: on, primaryProvider: "upi_direct" })}
          />
          <ToggleRow
            label="Cards"
            hint="Coming soon — Visa / Mastercard partner stubs"
            checked={providers?.cardsEnabled ?? false}
            onChange={(on) => patchProviders({ cardsEnabled: on })}
          />
        </div>
      </section>

      <section className="mt-10 border-t border-[var(--nx-mist)] pt-8">
        <h2 className="font-display text-xl font-semibold">Shopping agents</h2>
        <p className="mt-1 text-sm text-[var(--nx-muted)]">
          Let AI agents browse your catalog and create UPI payments. One switch, one key.
        </p>
        <div className="mt-4 space-y-3">
          <ToggleRow
            label="Allow shopping agents"
            hint="Off by default"
            checked={agentsEnabled}
            onChange={toggleAgents}
          />
          {agentsEnabled && (
            <div className="rounded-md bg-[var(--nx-mist)]/60 p-4 text-sm">
              {freshApiKey ? (
                <div className="space-y-2">
                  <p className="font-medium text-[var(--nx-ink)]">Copy your API key now</p>
                  <code className="block break-all rounded bg-[var(--nx-paper)] p-2 text-xs">
                    {freshApiKey}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => navigator.clipboard?.writeText(freshApiKey)}
                  >
                    Copy
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" onClick={createKey}>
                    {hasActiveKey ? "Rotate API key" : "Create API key"}
                  </Button>
                  {hasActiveKey && (
                    <span className="text-xs text-[var(--nx-muted)]">
                      Active key prefix{" "}
                      {keys.find((k) => k.active)?.keyPrefix ?? "nxp_agent_…"}…
                    </span>
                  )}
                </div>
              )}
              {keys
                .filter((k) => k.active)
                .map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    className="mt-3 text-xs text-[#9B2C2C] underline"
                    onClick={() => revokeKey(k.id)}
                  >
                    Revoke key
                  </button>
                ))}
            </div>
          )}
        </div>
      </section>

      <section className="mt-10 border-t border-[var(--nx-mist)] pt-6">
        <button
          type="button"
          className="text-sm text-[var(--nx-muted)] underline"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? "Hide advanced" : "Advanced"}
        </button>
        {showAdvanced && providers && (
          <div className="mt-4 space-y-3">
            <ToggleRow
              label="Other providers"
              hint="Authorize.net stub — not configured"
              checked={providers.otherEnabled}
              onChange={(on) => patchProviders({ otherEnabled: on })}
            />
            {bothEnabled && (
              <Field label="Backup provider (optional)">
                <select
                  className="w-full rounded-md border border-[var(--nx-mist)] bg-[var(--nx-paper)] px-3 py-2 text-sm"
                  value={providers.backupProvider ?? ""}
                  onChange={(e) =>
                    patchProviders({
                      backupProvider: e.target.value || null,
                    })
                  }
                >
                  <option value="">None</option>
                  {providers.providers
                    .filter((p) => p.id !== providers.primaryProvider)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <p className="text-xs text-[var(--nx-muted)]">
              Primary is UPI. Card / other rails stay stubs until a partner is wired.
            </p>
          </div>
        )}
      </section>

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

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-md border border-[var(--nx-mist)] px-3 py-3">
      <span>
        <span className="block text-sm font-medium text-[var(--nx-ink)]">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-[var(--nx-muted)]">{hint}</span>}
      </span>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 accent-[var(--nx-accent)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
