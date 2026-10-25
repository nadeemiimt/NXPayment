"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, type MerchantTokenItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const GROUP_ORDER = [
  "run",
  "bootstrap",
  "webhooks",
  "gmail",
  "yahoo",
  "whatsapp",
  "branding",
] as const;

const GROUP_LABEL: Record<string, string> = {
  run: "Run — VPA & identity",
  bootstrap: "Bootstrap (.env)",
  webhooks: "Webhooks",
  gmail: "Gmail auto-confirm",
  yahoo: "Yahoo mailbox",
  whatsapp: "WhatsApp (OTP + pay invite)",
  branding: "Branding",
  ops: "Ops",
};

function reqBadge(req: MerchantTokenItem["requirement"]) {
  if (req === "required") return "Required";
  if (req === "recommended") return "Recommended";
  return "Optional";
}

function statusBadge(t: MerchantTokenItem) {
  if (!t.configured) return "Missing";
  return t.source === "db" ? "Set (DB)" : t.source === "env" ? "Set (env)" : "Set";
}

export default function MerchantTokensPage() {
  const [tokens, setTokens] = useState<MerchantTokenItem[]>([]);
  const [runReady, setRunReady] = useState(false);
  const [missingRequired, setMissingRequired] = useState<string[]>([]);
  const [missingRecommended, setMissingRecommended] = useState<string[]>([]);
  const [encryptionNote, setEncryptionNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const revealedValues = useRef<Record<string, string | null>>({});

  const refresh = useCallback(async () => {
    const res = await api.getTokens();
    setTokens(res.tokens);
    setRunReady(res.runReady);
    setMissingRequired(res.missingRequired);
    setMissingRecommended(res.missingRecommended);
    setEncryptionNote(
      `${res.encryption.mode} · key from ${res.encryption.keySource}. ${res.encryption.note}`
    );
    const nextDrafts: Record<string, string> = {};
    for (const t of res.tokens) {
      nextDrafts[t.key] = t.maskedPreview ?? "";
    }
    setDrafts(nextDrafts);
    setRevealed({});
    revealedValues.current = {};
  }, []);

  useEffect(() => {
    refresh().catch((e) =>
      setError(e instanceof Error ? e.message : "Failed to load tokens")
    );
  }, [refresh]);

  const grouped = useMemo(() => {
    const map = new Map<string, MerchantTokenItem[]>();
    for (const t of tokens) {
      const list = map.get(t.group) ?? [];
      list.push(t);
      map.set(t.group, list);
    }
    const ordered: { group: string; items: MerchantTokenItem[] }[] = [];
    for (const g of GROUP_ORDER) {
      const items = map.get(g);
      if (items?.length) ordered.push({ group: g, items });
      map.delete(g);
    }
    for (const [group, items] of map) {
      ordered.push({ group, items });
    }
    return ordered;
  }, [tokens]);

  async function ensureRevealed(key: string) {
    if (revealedValues.current[key]) return revealedValues.current[key];
    const res = await api.revealToken(key);
    revealedValues.current[key] = res.token.value;
    return res.token.value;
  }

  async function toggleReveal(t: MerchantTokenItem) {
    setError(null);
    setBusyKey(t.key);
    try {
      if (revealed[t.key]) {
        setRevealed((r) => ({ ...r, [t.key]: false }));
        setDrafts((d) => ({ ...d, [t.key]: t.maskedPreview ?? "" }));
        return;
      }
      const value = await ensureRevealed(t.key);
      if (!value) {
        setError(`${t.label} is not set.`);
        return;
      }
      setDrafts((d) => ({ ...d, [t.key]: value }));
      setRevealed((r) => ({ ...r, [t.key]: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reveal failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function copyToken(t: MerchantTokenItem) {
    setError(null);
    setMessage(null);
    setBusyKey(t.key);
    try {
      const value = await ensureRevealed(t.key);
      if (!value) {
        setError("Nothing to copy.");
        return;
      }
      await navigator.clipboard.writeText(value);
      setMessage(`Copied ${t.label}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Copy failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function saveToken(t: MerchantTokenItem) {
    setError(null);
    setMessage(null);
    const raw = (drafts[t.key] ?? "").trim();
    if (!raw || (t.configured && !revealed[t.key] && raw === (t.maskedPreview ?? ""))) {
      setError(`Enter a new value for ${t.label} (Reveal first if editing a masked field).`);
      return;
    }
    if (t.sensitive && raw.includes("••••")) {
      setError("Reveal or paste a full value before saving — masked placeholders are not accepted.");
      return;
    }
    setBusyKey(t.key);
    try {
      await api.updateToken(t.key, raw);
      setMessage(`Saved ${t.label}.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function clearToken(t: MerchantTokenItem) {
    if (!window.confirm(`Clear ${t.label}? Env fallback may still apply.`)) return;
    setError(null);
    setMessage(null);
    setBusyKey(t.key);
    try {
      await api.clearToken(t.key);
      setMessage(`Cleared ${t.label}.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clear failed");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="nx-rise">
      <p className="text-sm uppercase tracking-[0.2em] text-[var(--nx-accent)]">Setup</p>
      <h1 className="font-display mt-2 text-4xl font-semibold">Tokens & secrets</h1>
      <p className="mt-2 max-w-2xl text-[var(--nx-muted)]">
        One place to view (masked), reveal, copy, and update install credentials.
        Encrypted values live in SQLite; env remains fallback. Never commit real secrets.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
        <span
          className={`rounded-md px-2.5 py-1 ${
            runReady
              ? "bg-[var(--nx-mist)] text-[var(--nx-accent-dark)]"
              : "bg-[#f3e0d8] text-[#7a3b22]"
          }`}
        >
          {runReady ? "Stack can run" : "Missing core run config"}
        </span>
        {missingRequired.length > 0 && (
          <span className="text-[var(--nx-muted)]">
            Missing required: {missingRequired.join(", ")}
          </span>
        )}
        {missingRecommended.length > 0 && (
          <span className="text-[var(--nx-muted)]">
            Change recommended: {missingRecommended.join(", ")}
          </span>
        )}
      </div>
      {encryptionNote && (
        <p className="mt-3 max-w-3xl text-xs text-[var(--nx-muted)]">{encryptionNote}</p>
      )}

      <p className="mt-3 text-sm">
        <Link href="/merchant/onboarding" className="text-[var(--nx-accent)] underline-offset-2 hover:underline">
          Setup / branding
        </Link>
        {" · "}
        <Link href="/merchant/auto-confirm" className="text-[var(--nx-accent)] underline-offset-2 hover:underline">
          Auto-confirm mailbox
        </Link>
        {" · "}
        <Link href="/merchant/pending" className="text-[var(--nx-accent)] underline-offset-2 hover:underline">
          Confirm (WhatsApp pay invite)
        </Link>
      </p>

      <div className="mt-6 max-w-2xl border border-[var(--nx-line)] bg-[var(--nx-mist)]/50 px-4 py-3 text-sm text-[var(--nx-muted)]">
        <p className="font-medium text-[var(--nx-ink)]">WhatsApp pay invites</p>
        <p className="mt-1">
          Set <code className="font-mono text-xs">WHATSAPP_TOKEN</code> +{" "}
          <code className="font-mono text-xs">WHATSAPP_PHONE_ID</code> for live Meta Cloud
          (OTP templates + payment QR image messages). When unset, Confirm → WhatsApp pay invite
          returns a dry-run stub with text + QR PNG for local testing. Outbound audit stores
          masked phone only — never tokens.
        </p>
      </div>

      {message && (
        <p className="mt-4 rounded-md border border-[var(--nx-line)] bg-white/70 px-3 py-2 text-sm">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-md border border-[#e2b4a0] bg-[#faf0ea] px-3 py-2 text-sm text-[#7a3b22]">
          {error}
        </p>
      )}

      <div className="mt-10 space-y-10">
        {grouped.map(({ group, items }) => (
          <section key={group}>
            <h2 className="font-display text-2xl">{GROUP_LABEL[group] ?? group}</h2>
            <ul className="mt-4 space-y-4">
              {items.map((t) => {
                const busy = busyKey === t.key;
                const canClear =
                  t.persist === "merchant_secrets" ||
                  t.persist === "merchant_oauth_app" ||
                  t.key === "SECONDARY_VPA" ||
                  t.key === "WEBHOOK_URL" ||
                  t.key === "LOGO_URL" ||
                  t.key === "EMAIL_MAILBOX_SECRET" ||
                  t.key === "SECRETS_KEY";
                return (
                  <li
                    key={t.key}
                    className="rounded-xl border border-[var(--nx-line)] bg-white/55 px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{t.label}</p>
                        <p className="mt-0.5 font-mono text-xs text-[var(--nx-muted)]">{t.key}</p>
                        <p className="mt-2 max-w-xl text-sm text-[var(--nx-muted)]">
                          {t.description}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="rounded bg-[var(--nx-mist)] px-2 py-1">
                          {reqBadge(t.requirement)}
                        </span>
                        <span
                          className={`rounded px-2 py-1 ${
                            t.configured
                              ? "bg-[var(--nx-mist)] text-[var(--nx-accent-dark)]"
                              : "bg-[#f3e0d8] text-[#7a3b22]"
                          }`}
                        >
                          {statusBadge(t)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Input
                        className="font-mono text-sm"
                        type={t.sensitive && !revealed[t.key] ? "password" : "text"}
                        value={drafts[t.key] ?? ""}
                        placeholder={t.configured ? undefined : "Paste value…"}
                        onChange={(e) => {
                          setDrafts((d) => ({ ...d, [t.key]: e.target.value }));
                          setRevealed((r) => ({ ...r, [t.key]: true }));
                        }}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy || !t.configured}
                          onClick={() => void toggleReveal(t)}
                        >
                          {revealed[t.key] ? "Hide" : "Reveal"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy || !t.configured}
                          onClick={() => void copyToken(t)}
                        >
                          Copy
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy}
                          onClick={() => void saveToken(t)}
                        >
                          Save
                        </Button>
                        {canClear && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy || !t.configured}
                            onClick={() => void clearToken(t)}
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
