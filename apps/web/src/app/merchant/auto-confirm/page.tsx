"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type EmailStatus = {
  autoConfirmEnabled: boolean;
  androidAutoConfirm: boolean;
  emailAutoConfirm: boolean;
  emailConnected: boolean;
  emailProvider: string | null;
  emailAddress: string | null;
  gmailOAuthConfigured: boolean;
  yahooOAuthConfigured: boolean;
  primaryVerification: string;
};

export default function AutoConfirmPage() {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [email, setEmail] = useState("");
  const [secret, setSecret] = useState("");
  const [provider, setProvider] = useState<"gmail" | "yahoo" | "mock">("gmail");
  const [sampleSubject, setSampleSubject] = useState(
    "ALERT: Account credited with Rs. 1.00"
  );
  const [sampleBody, setSampleBody] = useState(
    "Dear Customer, your account has been credited with Rs. 1.00. Ref no: UTR-DEMO-001 from buyer@upi."
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const s = await api.creditEmailStatus();
    setStatus(s);
  }

  useEffect(() => {
    refresh().catch((e) =>
      setError(e instanceof Error ? e.message : "Failed to load status")
    );
  }, []);

  async function toggle(field: "autoConfirmEnabled" | "androidAutoConfirm" | "emailAutoConfirm") {
    if (!status) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateCreditSettings({ [field]: !status[field] });
      await refresh();
      setMessage("Settings saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.connectEmail({
        provider,
        emailAddress: email.trim(),
        secret: secret.trim() || "mock",
      });
      setMessage(res.note ?? "Mailbox linked.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed");
    } finally {
      setBusy(false);
    }
  }

  async function ingestSample() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.ingestEmailSample({
        subject: sampleSubject,
        body: sampleBody,
        poll: true,
      });
      setMessage(
        `Ingested sample. Poll: scanned=${res.poll.scanned} confirmed=${res.poll.confirmed} skipped=${res.poll.skipped}`
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ingest failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Auto-confirm</h1>
        <p className="mt-2 text-[var(--nx-muted)]">
          <strong className="text-[var(--nx-ink)]">Payment verification = Bank SMS &amp; Gmail alerts</strong>{" "}
          parsed in near real time — not aggregator webhooks. Manual Confirm on Pending always
          remains available.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-[#9B2C2C]/40 bg-[#9B2C2C]/10 px-3 py-2 text-sm text-[#9B2C2C]">
          {error}
        </p>
      )}
      {message && <p className="text-sm text-[var(--nx-accent)]">{message}</p>}

      {status && (
        <div className="space-y-3 rounded-md border border-[var(--nx-line)] p-4">
          <ToggleRow
            label="Enable auto-confirm (master)"
            on={status.autoConfirmEnabled}
            disabled={busy}
            onClick={() => void toggle("autoConfirmEnabled")}
          />
          <ToggleRow
            label="Android: notifications / SMS observer"
            on={status.androidAutoConfirm}
            disabled={busy}
            onClick={() => void toggle("androidAutoConfirm")}
          />
          <ToggleRow
            label="Email: Gmail (headline) / Yahoo (optional)"
            on={status.emailAutoConfirm}
            disabled={busy}
            onClick={() => void toggle("emailAutoConfirm")}
          />
          <p className="text-xs text-[var(--nx-muted)]">{status.primaryVerification}</p>
          <p className="text-xs text-[var(--nx-muted)]">
            Gmail OAuth app env: {status.gmailOAuthConfigured ? "configured" : "not set (mock/ingest OK)"} ·
            Yahoo OAuth: {status.yahooOAuthConfigured ? "configured" : "not set"}
          </p>
          {status.emailConnected && (
            <p className="text-sm">
              Connected: {status.emailProvider} · {status.emailAddress}
            </p>
          )}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Connect mailbox</h2>
        <p className="text-sm text-[var(--nx-muted)]">
          Gmail is the primary email path. Live Gmail API polling needs{" "}
          <code className="text-xs">GMAIL_CLIENT_ID</code> /{" "}
          <code className="text-xs">GMAIL_CLIENT_SECRET</code>. Until then use{" "}
          <strong>mock</strong> + paste a bank alert sample below.
        </p>
        <div className="flex flex-wrap gap-2">
          {(["gmail", "yahoo", "mock"] as const).map((p) => (
            <Button
              key={p}
              type="button"
              variant={provider === p ? "default" : "outline"}
              size="sm"
              onClick={() => setProvider(p)}
            >
              {p}
            </Button>
          ))}
        </div>
        <Input
          placeholder="merchant@gmail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          placeholder="OAuth refresh token / IMAP app password / mock"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
        />
        <Button type="button" disabled={busy || !email.trim()} onClick={() => void connect()}>
          Connect {provider}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void api.disconnectEmail().then(refresh).catch((e) => setError(String(e)))
          }
        >
          Disconnect
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Dev: paste bank email sample</h2>
        <Input value={sampleSubject} onChange={(e) => setSampleSubject(e.target.value)} />
        <textarea
          className="min-h-[120px] w-full rounded-md border border-[var(--nx-line)] bg-white/80 p-3 text-sm"
          value={sampleBody}
          onChange={(e) => setSampleBody(e.target.value)}
        />
        <Button type="button" disabled={busy} onClick={() => void ingestSample()}>
          Ingest &amp; poll matcher
        </Button>
      </section>
    </div>
  );
}

function ToggleRow({
  label,
  on,
  disabled,
  onClick,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      <Button type="button" size="sm" variant={on ? "default" : "outline"} disabled={disabled} onClick={onClick}>
        {on ? "On" : "Off"}
      </Button>
    </div>
  );
}
