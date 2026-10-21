"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GmailOAuthCredentialsPanel } from "@/components/gmail-oauth-credentials";

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

function connectedBannerText(provider: string | null, address: string | null): string {
  const p = provider?.trim() || "mailbox";
  const a = address?.trim() || "unknown";
  return `Mailbox connected: ${p} · ${a}`;
}

const BLOCKED_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "localhost",
  "test.com",
  "invalid",
]);
const FAKE_SECRETS = new Set(["mock", "fake-refresh", "fake", "test", "password", "secret"]);

function validateConnectInput(
  provider: "gmail" | "yahoo" | "mock",
  emailAddress: string,
  token: string
): string | null {
  if (!emailAddress) return "Enter the mailbox email address.";
  const at = emailAddress.indexOf("@");
  if (at < 1 || at === emailAddress.length - 1) return "Enter a valid email address.";
  const domain = emailAddress.slice(at + 1).toLowerCase();
  if (BLOCKED_EMAIL_DOMAINS.has(domain) || domain.endsWith(".example.com")) {
    return "Use a real mailbox address — not test@example.com or example.com.";
  }
  if (provider === "gmail") {
    if (domain !== "gmail.com" && domain !== "googlemail.com") {
      return "Gmail provider requires a @gmail.com or @googlemail.com address.";
    }
    if (!token || FAKE_SECRETS.has(token.toLowerCase())) {
      return "Paste the real Gmail OAuth refresh token (not mock / fake-refresh).";
    }
  } else if (provider === "yahoo") {
    if (!token || FAKE_SECRETS.has(token.toLowerCase())) {
      return "Enter a real Yahoo credential (not mock / fake-refresh).";
    }
  }
  return null;
}

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
  const [connecting, setConnecting] = useState(false);

  async function refresh() {
    const s = await api.creditEmailStatus();
    setStatus({
      autoConfirmEnabled: Boolean(s.autoConfirmEnabled),
      androidAutoConfirm: Boolean(s.androidAutoConfirm),
      emailAutoConfirm: Boolean(s.emailAutoConfirm),
      emailConnected: Boolean(s.emailConnected),
      emailProvider: s.emailProvider ?? null,
      emailAddress: s.emailAddress ?? null,
      gmailOAuthConfigured: Boolean(s.gmailOAuthConfigured),
      yahooOAuthConfigured: Boolean(s.yahooOAuthConfigured),
      primaryVerification:
        s.primaryVerification ??
        "Bank SMS & Gmail alerts parsed in near real time — not aggregator webhooks",
    });
    return s;
  }

  useEffect(() => {
    refresh()
      .then((s) => {
        if (s.emailConnected && s.emailAddress) {
          setEmail(s.emailAddress);
          setMessage(connectedBannerText(s.emailProvider, s.emailAddress));
        } else {
          setEmail("");
          setMessage(null);
        }
        if (
          s.emailProvider === "gmail" ||
          s.emailProvider === "yahoo" ||
          s.emailProvider === "mock"
        ) {
          setProvider(s.emailProvider);
        }
      })
      .catch((e) =>
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    const emailAddress = email.trim().toLowerCase();
    const token = secret.trim() || (provider === "mock" ? "mock" : "");
    const validationError = validateConnectInput(provider, emailAddress, token);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setConnecting(true);
    setError(null);
    try {
      const res = await api.connectEmail({
        provider,
        emailAddress,
        secret: token,
      });
      const nextProvider = res.config.emailProvider ?? provider;
      const nextAddress = res.config.emailAddress ?? emailAddress;
      // Apply connect response immediately so the banner does not depend on a follow-up GET.
      setStatus((prev) => ({
        autoConfirmEnabled: Boolean(res.config.autoConfirmEnabled ?? prev?.autoConfirmEnabled),
        androidAutoConfirm: Boolean(prev?.androidAutoConfirm),
        emailAutoConfirm: Boolean(res.config.emailAutoConfirm ?? prev?.emailAutoConfirm ?? true),
        emailConnected: Boolean(res.config.emailConnected),
        emailProvider: nextProvider,
        emailAddress: nextAddress,
        gmailOAuthConfigured: Boolean(prev?.gmailOAuthConfigured),
        yahooOAuthConfigured: Boolean(prev?.yahooOAuthConfigured),
        primaryVerification:
          prev?.primaryVerification ??
          "Bank SMS & Gmail alerts parsed in near real time — not aggregator webhooks",
      }));
      setMessage(connectedBannerText(nextProvider, nextAddress));
      setSecret("");
      // Refresh in background to sync toggles / OAuth flags; never clear the banner on soft failure.
      void refresh().catch(() => {
        /* keep connect success UI */
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed");
    } finally {
      setConnecting(false);
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await api.disconnectEmail();
      setMessage(null);
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              emailConnected: false,
              emailProvider: null,
              emailAddress: null,
              emailAutoConfirm: false,
            }
          : prev
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disconnect failed");
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

  const showConnected =
    Boolean(status?.emailConnected) && Boolean(status?.emailAddress);
  const banner =
    message ??
    (showConnected
      ? connectedBannerText(status?.emailProvider ?? null, status?.emailAddress ?? null)
      : null);

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
            Gmail OAuth app:{" "}
            {status.gmailOAuthConfigured
              ? "configured (DB or env)"
              : "not set (mock/ingest OK)"}{" "}
            · Yahoo OAuth: {status.yahooOAuthConfigured ? "configured" : "not set"}
          </p>
        </div>
      )}

      <GmailOAuthCredentialsPanel />

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Connect mailbox</h2>
        <p className="text-sm text-[var(--nx-muted)]">
          Gmail is the primary email path. Saving here stores the mailbox email and refresh
          token in the app DB. Live Gmail API polling also needs OAuth app credentials above
          (or <code className="text-xs">GMAIL_CLIENT_*</code> env). Until then use{" "}
          <strong>mock</strong> + paste a bank alert sample below.
        </p>
        <p className="text-sm text-[var(--nx-ink)]">
          Use the Gmail that receives bank alerts (e.g. nadeemiimt@gmail.com), not a test
          address.
        </p>
        {error && (
          <p
            role="alert"
            className="rounded-md border border-[#9B2C2C]/40 bg-[#9B2C2C]/10 px-3 py-2 text-sm text-[#9B2C2C]"
          >
            {error}
          </p>
        )}
        {banner && (
          <p
            role="status"
            data-testid="mailbox-connected-banner"
            className="rounded-md border border-[#0B6E4F] bg-[#E6F4EF] px-3 py-2 text-sm font-medium text-[#08553C]"
          >
            {banner}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {(["gmail", "yahoo", "mock"] as const).map((p) => (
            <Button
              key={p}
              type="button"
              variant={provider === p ? "default" : "outline"}
              size="sm"
              disabled={busy}
              onClick={() => setProvider(p)}
            >
              {p}
            </Button>
          ))}
        </div>
        <Input
          placeholder="merchant@gmail.com"
          value={email}
          autoComplete="off"
          disabled={busy}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          placeholder="OAuth refresh token / IMAP app password / mock"
          value={secret}
          type="password"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          onChange={(e) => setSecret(e.target.value)}
        />
        <Button
          type="button"
          disabled={busy || !email.trim()}
          onClick={() => void connect()}
        >
          {connecting ? "Connecting…" : `Connect ${provider}`}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void disconnect()}>
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
