"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MaskedStatus = Awaited<ReturnType<typeof api.getGmailOAuth>>["gmailOAuth"];

const MASK = "••••••••••••••••";

function maskDisplay(configured: boolean, last4: string | null): string {
  if (!configured) return "";
  return last4 ? `${MASK.slice(0, 12)}${last4}` : MASK;
}

export function GmailOAuthCredentialsPanel() {
  const [status, setStatus] = useState<MaskedStatus | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [revealId, setRevealId] = useState(false);
  const [revealSecret, setRevealSecret] = useState(false);
  const [jsonPaste, setJsonPaste] = useState("");
  const [redirectHints, setRedirectHints] = useState<string[]>([]);
  const [originHints, setOriginHints] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Hold revealed values in memory only for Copy — never put in React state logs. */
  const revealedRef = useRef<{ clientId: string | null; clientSecret: string | null }>({
    clientId: null,
    clientSecret: null,
  });

  const refresh = useCallback(async () => {
    const res = await api.getGmailOAuth();
    setStatus(res.gmailOAuth);
    setRedirectHints(res.gmailOAuth.redirectUris);
    setOriginHints(res.gmailOAuth.javascriptOrigins);
    if (res.gmailOAuth.clientIdConfigured) {
      setClientId(maskDisplay(true, res.gmailOAuth.clientIdLast4));
    } else {
      setClientId("");
    }
    if (res.gmailOAuth.clientSecretConfigured) {
      setClientSecret(maskDisplay(true, res.gmailOAuth.clientSecretLast4));
    } else {
      setClientSecret("");
    }
    setRevealId(false);
    setRevealSecret(false);
    revealedRef.current = { clientId: null, clientSecret: null };
  }, []);

  useEffect(() => {
    refresh().catch((e) =>
      setError(e instanceof Error ? e.message : "Failed to load Gmail OAuth status")
    );
  }, [refresh]);

  async function ensureRevealed() {
    if (revealedRef.current.clientId && revealedRef.current.clientSecret) {
      return revealedRef.current;
    }
    const res = await api.revealGmailOAuth();
    revealedRef.current = {
      clientId: res.gmailOAuth.clientId,
      clientSecret: res.gmailOAuth.clientSecret,
    };
    return revealedRef.current;
  }

  async function toggleReveal(which: "id" | "secret") {
    setError(null);
    try {
      if (which === "id") {
        if (revealId) {
          setRevealId(false);
          if (status?.clientIdConfigured) {
            setClientId(maskDisplay(true, status.clientIdLast4));
          }
          return;
        }
        const revealed = await ensureRevealed();
        if (revealed.clientId) {
          setClientId(revealed.clientId);
          setRevealId(true);
        }
      } else {
        if (revealSecret) {
          setRevealSecret(false);
          if (status?.clientSecretConfigured) {
            setClientSecret(maskDisplay(true, status.clientSecretLast4));
          }
          return;
        }
        const revealed = await ensureRevealed();
        if (revealed.clientSecret) {
          setClientSecret(revealed.clientSecret);
          setRevealSecret(true);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reveal failed");
    }
  }

  async function copyField(which: "id" | "secret") {
    setError(null);
    setMessage(null);
    try {
      const revealed = await ensureRevealed();
      const value = which === "id" ? revealed.clientId : revealed.clientSecret;
      if (!value) {
        setError("Nothing to copy — save credentials first.");
        return;
      }
      await navigator.clipboard.writeText(value);
      setMessage(which === "id" ? "Client ID copied." : "Client secret copied.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Copy failed");
    }
  }

  function applyParsedJson(raw: string) {
    setError(null);
    setMessage(null);
    try {
      const parsed = JSON.parse(raw) as {
        web?: {
          client_id?: string;
          client_secret?: string;
          redirect_uris?: string[];
          javascript_origins?: string[];
        };
      };
      if (!parsed?.web) {
        setError('JSON must include a "web" object (Google Web application client).');
        return;
      }
      if (parsed.web.client_id) {
        setClientId(parsed.web.client_id);
        setRevealId(true);
      }
      if (parsed.web.client_secret) {
        setClientSecret(parsed.web.client_secret);
        setRevealSecret(true);
      }
      if (Array.isArray(parsed.web.redirect_uris)) {
        setRedirectHints(parsed.web.redirect_uris);
      }
      if (Array.isArray(parsed.web.javascript_origins)) {
        setOriginHints(parsed.web.javascript_origins);
      }
      setJsonPaste(raw);
      setMessage("Parsed web client JSON — review and Save.");
    } catch {
      setError("Invalid JSON.");
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body: {
        clientId?: string;
        clientSecret?: string;
        webClientJson?: unknown;
      } = {};

      const idLooksMasked = clientId.includes("•");
      const secretLooksMasked = clientSecret.includes("•");
      if (clientId.trim() && !idLooksMasked) body.clientId = clientId.trim();
      if (clientSecret.trim() && !secretLooksMasked) body.clientSecret = clientSecret.trim();

      if (jsonPaste.trim()) {
        try {
          body.webClientJson = JSON.parse(jsonPaste);
        } catch {
          setError("Paste valid Google client JSON or clear the paste box.");
          setBusy(false);
          return;
        }
      }

      if (!body.clientId && !body.clientSecret && !body.webClientJson) {
        setError("Enter Client ID + Secret, or paste/upload Google client JSON.");
        setBusy(false);
        return;
      }

      await api.updateGmailOAuth(body);
      setJsonPaste("");
      setMessage("Gmail OAuth credentials saved (encrypted in SQLite).");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function clearDb() {
    setBusy(true);
    setError(null);
    try {
      await api.clearGmailOAuth();
      setMessage("Cleared DB-stored Gmail OAuth credentials (env fallback still applies).");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clear failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-md border border-[var(--nx-line)] p-4">
      <h2 className="font-display text-xl font-semibold">Gmail OAuth app credentials</h2>
      <p className="text-sm text-[var(--nx-muted)]">
        Paste your Google Cloud <strong className="text-[var(--nx-ink)]">Web application</strong>{" "}
        client ID and secret (or the downloaded JSON). Stored encrypted in this install&apos;s
        SQLite — preferred over process env. Secrets stay masked after save.
      </p>

      {status && (
        <p className="text-xs text-[var(--nx-muted)]">
          Status:{" "}
          {status.configured
            ? `configured (${status.source}${status.clientSecretLast4 ? ` · …${status.clientSecretLast4}` : ""})`
            : "not configured"}{" "}
          · encryption: {status.encryption.mode} via {status.encryption.keySource}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md border border-[#9B2C2C]/40 bg-[#9B2C2C]/10 px-3 py-2 text-sm text-[#9B2C2C]"
        >
          {error}
        </p>
      )}
      {message && <p className="text-sm text-[var(--nx-accent)]">{message}</p>}

      <label className="block space-y-1 text-sm">
        <span>Client ID</span>
        <div className="flex flex-wrap gap-2">
          <Input
            className="min-w-[12rem] flex-1 font-mono text-xs"
            type={revealId ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setRevealId(true);
            }}
            placeholder="….apps.googleusercontent.com"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !status?.clientIdConfigured}
            onClick={() => void toggleReveal("id")}
          >
            {revealId ? "Hide" : "Reveal"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !status?.clientIdConfigured}
            onClick={() => void copyField("id")}
          >
            Copy
          </Button>
        </div>
      </label>

      <label className="block space-y-1 text-sm">
        <span>Client secret</span>
        <div className="flex flex-wrap gap-2">
          <Input
            className="min-w-[12rem] flex-1 font-mono text-xs"
            type={revealSecret ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            value={clientSecret}
            onChange={(e) => {
              setClientSecret(e.target.value);
              setRevealSecret(true);
            }}
            placeholder="GOCSPX-…"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !status?.clientSecretConfigured}
            onClick={() => void toggleReveal("secret")}
          >
            {revealSecret ? "Hide" : "Reveal"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !status?.clientSecretConfigured}
            onClick={() => void copyField("secret")}
          >
            Copy
          </Button>
        </div>
      </label>

      <label className="block space-y-1 text-sm">
        <span>Optional: paste Google client JSON</span>
        <textarea
          className="min-h-[88px] w-full rounded-md border border-[var(--nx-line)] bg-white/80 p-3 font-mono text-xs"
          placeholder='{"web":{"client_id":"…","client_secret":"…","redirect_uris":[…]}}'
          value={jsonPaste}
          onChange={(e) => setJsonPaste(e.target.value)}
          spellCheck={false}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || !jsonPaste.trim()}
          onClick={() => applyParsedJson(jsonPaste)}
        >
          Parse JSON
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          Upload JSON
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              const text = typeof reader.result === "string" ? reader.result : "";
              applyParsedJson(text);
            };
            reader.readAsText(file);
            e.target.value = "";
          }}
        />
      </div>

      {(redirectHints.length > 0 || originHints.length > 0) && (
        <div className="space-y-1 text-xs text-[var(--nx-muted)]">
          <p className="font-medium text-[var(--nx-ink)]">Redirect URI hints (read-only)</p>
          <ul className="list-inside list-disc font-mono">
            {redirectHints.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
          {status?.defaultRedirectUri && (
            <p>
              App default: <code>{status.defaultRedirectUri}</code>
            </p>
          )}
          {originHints.length > 0 && (
            <>
              <p className="mt-2 font-medium text-[var(--nx-ink)]">JavaScript origins</p>
              <ul className="list-inside list-disc font-mono">
                {originHints.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" disabled={busy} onClick={() => void save()}>
          Save credentials
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || status?.source !== "db"}
          onClick={() => void clearDb()}
        >
          Clear DB secrets
        </Button>
      </div>
      {status?.encryption?.note && (
        <p className="text-xs text-[var(--nx-muted)]">{status.encryption.note}</p>
      )}
    </section>
  );
}
