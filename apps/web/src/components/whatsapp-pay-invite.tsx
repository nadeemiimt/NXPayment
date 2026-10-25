"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type WhatsAppPayInviteResult } from "@/lib/api";
import { formatInr } from "@/lib/utils";

export function WhatsAppPayInvite({
  paymentId,
  amountPaise,
}: {
  paymentId: string;
  amountPaise: number;
}) {
  const [phone, setPhone] = useState("+91");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WhatsAppPayInviteResult | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.sendWhatsAppPayInvite(paymentId, {
        phoneE164: phone.trim(),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-md border border-[var(--nx-line)] bg-[var(--nx-mist)]/60 p-4">
      <p className="text-sm font-medium text-[var(--nx-ink)]">
        WhatsApp pay invite
      </p>
      <p className="mt-1 text-xs text-[var(--nx-muted)]">
        Send {formatInr(amountPaise)} with UPI link + QR to the buyer. Uses Meta Cloud when
        tokens are set; otherwise dry-run stub.
      </p>
      <label className="mt-3 block text-xs font-medium text-[var(--nx-muted)]">
        Buyer WhatsApp (E.164)
        <Input
          className="mt-1.5 bg-white/80"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+919876543210"
          inputMode="tel"
        />
      </label>
      {error && <p className="mt-2 text-sm text-[var(--nx-danger)]">{error}</p>}
      <Button className="mt-3 w-full" disabled={busy || phone.trim().length < 10} onClick={send}>
        {busy ? "Sending…" : "Send payment + QR"}
      </Button>
      {result && (
        <div className="mt-3 space-y-2 rounded-md border border-dashed border-[var(--nx-line)] bg-white/70 p-3 text-xs">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--nx-accent-dark)]">
            {result.mode === "stub" ? "Dry-run stub" : "Meta Cloud"} ·{" "}
            {result.ok ? "ok" : "failed"}
          </p>
          <p className="text-[var(--nx-muted)]">{result.detail}</p>
          {result.stubPayload && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-[var(--nx-ink)]">
              {JSON.stringify(
                {
                  to: result.stubPayload.to,
                  text: result.stubPayload.text,
                  upiUri: result.stubPayload.upiUri,
                  hasQrPng: Boolean(result.stubPayload.qrPngBase64),
                  messageId: result.messageId,
                  auditId: result.auditId,
                },
                null,
                2
              )}
            </pre>
          )}
          {result.stubPayload?.qrPngBase64 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/png;base64,${result.stubPayload.qrPngBase64}`}
              alt="UPI QR preview"
              className="mx-auto h-28 w-28 rounded border border-[var(--nx-line)] bg-white p-1"
            />
          )}
        </div>
      )}
    </div>
  );
}
