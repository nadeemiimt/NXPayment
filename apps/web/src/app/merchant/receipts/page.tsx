"use client";

import { useEffect, useState } from "react";
import { api, type ReceiptSettings } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ReceiptSettingsPage() {
  const [settings, setSettings] = useState<ReceiptSettings | null>(null);
  const [paperWidthMm, setPaperWidthMm] = useState<58 | 80>(58);
  const [headerText, setHeaderText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [thankYouText, setThankYouText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getReceiptSettings()
      .then((r) => {
        setSettings(r.receipt);
        setPaperWidthMm(r.receipt.paperWidthMm);
        setHeaderText(r.receipt.headerText ?? "");
        setFooterText(r.receipt.footerText ?? "");
        setThankYouText(r.receipt.thankYouText ?? "");
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Receipts</h1>
      <p className="mt-2 max-w-2xl text-[var(--nx-muted)]">
        Thermal 58mm / 80mm settings for browser Print and ESC/POS download. After Confirm, open the
        receipt page and print to your USB/network driver.
      </p>
      {error && <p className="mt-3 text-sm text-[#9B2C2C]">{error}</p>}
      {msg && <p className="mt-3 text-sm text-[var(--nx-accent)]">{msg}</p>}

      <form
        className="mt-8 grid max-w-xl gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            const r = await api.updateReceiptSettings({
              paperWidthMm,
              headerText: headerText.trim() || null,
              footerText: footerText.trim() || null,
              thankYouText: thankYouText.trim() || null,
            });
            setSettings(r.receipt);
            setMsg("Receipt settings saved.");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Save failed");
          }
        }}
      >
        <label className="block text-sm">
          <span className="text-[var(--nx-muted)]">Paper width</span>
          <select
            className="mt-1 flex h-11 w-full rounded-md border border-[var(--nx-line)] bg-white/80 px-3"
            value={paperWidthMm}
            onChange={(e) => setPaperWidthMm(Number(e.target.value) as 58 | 80)}
          >
            <option value={58}>58mm</option>
            <option value={80}>80mm</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-[var(--nx-muted)]">Header</span>
          <Input
            className="mt-1"
            value={headerText}
            onChange={(e) => setHeaderText(e.target.value)}
            placeholder="Optional header"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--nx-muted)]">Footer</span>
          <Input
            className="mt-1"
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            placeholder="GSTIN / address"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--nx-muted)]">Thank-you line</span>
          <Input
            className="mt-1"
            value={thankYouText}
            onChange={(e) => setThankYouText(e.target.value)}
            placeholder="Thank you! Visit again."
          />
        </label>
        <Button type="submit">Save</Button>
      </form>

      {settings?.printBridge && (
        <p className="mt-6 max-w-xl text-sm text-[var(--nx-muted)]">{settings.printBridge.note}</p>
      )}
    </div>
  );
}
