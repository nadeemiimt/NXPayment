"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Purpose = "checkout_gate" | "onboarding_gate";

export function WhatsAppOtpGate({
  purpose,
  defaultPhone,
  title,
  description,
  onVerified,
}: {
  purpose: Purpose;
  defaultPhone?: string;
  title: string;
  description: string;
  onVerified: () => void;
}) {
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [stubHint, setStubHint] = useState<string | null>(null);
  const [mode, setMode] = useState<"stub" | "meta_cloud" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.sendWhatsAppOtp({
        phoneE164: phone.trim(),
        purpose,
      });
      setChallengeId(r.challengeId);
      setMode(r.mode);
      setStubHint(r.stubCode ?? null);
      if (r.stubCode) setCode(r.stubCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!challengeId) return;
    setBusy(true);
    setError(null);
    try {
      await api.verifyWhatsAppOtp({ challengeId, code: code.trim() });
      onVerified();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verify failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--nx-line)] bg-white/70 p-6">
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-[var(--nx-muted)]">{description}</p>

      <div className="mt-6 space-y-3">
        <label className="block text-sm font-medium">
          WhatsApp number (E.164)
          <Input
            className="mt-1.5"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+919876543210"
            disabled={Boolean(challengeId)}
          />
        </label>

        {!challengeId ? (
          <Button type="button" disabled={busy || !phone.trim()} onClick={() => void send()}>
            {busy ? "Sending…" : "Send OTP"}
          </Button>
        ) : (
          <>
            <label className="block text-sm font-medium">
              OTP code
              <Input
                className="mt-1.5"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </label>
            {mode === "stub" && stubHint && (
              <p className="text-xs text-[var(--nx-muted)]">
                Dry-run mode (no Meta credentials): use code <strong>{stubHint}</strong>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy || !code.trim()} onClick={() => void verify()}>
                {busy ? "Checking…" : "Verify"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setChallengeId(null);
                  setCode("");
                  setStubHint(null);
                }}
              >
                Resend
              </Button>
            </div>
          </>
        )}
        {error && <p className="text-sm text-[#9B2C2C]">{error}</p>}
      </div>
    </div>
  );
}
