"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { API_URL, api, type Receipt } from "@/lib/api";
import { formatInr } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function ReceiptPrintPage() {
  const params = useParams<{ paymentId: string }>();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bridgeMsg, setBridgeMsg] = useState<string | null>(null);

  useEffect(() => {
    api
      .getReceipt(params.paymentId)
      .then((r) => setReceipt(r.receipt))
      .catch((e) => setError(e.message));
  }, [params.paymentId]);

  if (error) {
    return (
      <div>
        <p className="text-[#9B2C2C]">{error}</p>
        <Link href="/merchant/payments" className="mt-4 inline-block text-sm underline">
          Back to payments
        </Link>
      </div>
    );
  }

  if (!receipt) {
    return <p className="text-[var(--nx-muted)]">Loading receipt…</p>;
  }

  const widthClass = receipt.paperWidthMm === 80 ? "receipt-80" : "receipt-58";

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold">Receipt</h1>
        <Button type="button" onClick={() => window.print()}>
          Print
        </Button>
        <Button asChild type="button" variant="outline">
          <a href={api.escposDownloadUrl(params.paymentId)}>Download ESC/POS</a>
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={async () => {
            const r = await api.bridgePrint(params.paymentId);
            setBridgeMsg(r.bridge.message);
          }}
        >
          Bridge print (stub)
        </Button>
        <Link href="/merchant/receipts" className="text-sm text-[var(--nx-muted)] underline">
          Receipt settings
        </Link>
      </div>
      {bridgeMsg && (
        <p className="no-print mb-4 text-sm text-[var(--nx-muted)]">{bridgeMsg}</p>
      )}

      <article className={`receipt-sheet ${widthClass}`}>
        {receipt.headerText && <p className="receipt-center">{receipt.headerText}</p>}
        <h2 className="receipt-center receipt-shop">{receipt.shopName}</h2>
        <p className="receipt-center receipt-muted">{receipt.brandName}</p>
        <hr className="receipt-rule" />
        <p className="receipt-center">
          {new Date(receipt.paymentAt).toLocaleString("en-IN")}
        </p>
        <p>Status: {receipt.status}</p>
        <p>Txn: {receipt.paymentId}</p>
        {receipt.merchantOrderId && <p>Order: {receipt.merchantOrderId}</p>}
        <hr className="receipt-rule" />
        {receipt.lines.map((line, i) => (
          <div key={i} className="receipt-row">
            <span>{line.label}</span>
            <span>{line.amountPaise != null ? formatInr(line.amountPaise) : ""}</span>
          </div>
        ))}
        {receipt.gst && (
          <>
            <hr className="receipt-rule" />
            {receipt.gst.taxablePaise != null && (
              <div className="receipt-row">
                <span>Taxable</span>
                <span>{formatInr(receipt.gst.taxablePaise)}</span>
              </div>
            )}
            {!!receipt.gst.cgstPaise && (
              <div className="receipt-row">
                <span>CGST</span>
                <span>{formatInr(receipt.gst.cgstPaise)}</span>
              </div>
            )}
            {!!receipt.gst.sgstPaise && (
              <div className="receipt-row">
                <span>SGST</span>
                <span>{formatInr(receipt.gst.sgstPaise)}</span>
              </div>
            )}
            {!!receipt.gst.igstPaise && (
              <div className="receipt-row">
                <span>IGST</span>
                <span>{formatInr(receipt.gst.igstPaise)}</span>
              </div>
            )}
            {receipt.gst.ratePercent != null && <p>GST {receipt.gst.ratePercent}%</p>}
          </>
        )}
        <hr className="receipt-rule" />
        <div className="receipt-row receipt-total">
          <span>TOTAL</span>
          <span>{formatInr(receipt.amountPaise)}</span>
        </div>
        <p>UPI: {receipt.receivingVpa}</p>
        {receipt.utr && <p>UTR: {receipt.utr}</p>}
        <hr className="receipt-rule" />
        <p className="receipt-center">{receipt.thankYouText || "Thank you! Visit again."}</p>
        {receipt.footerText && <p className="receipt-center receipt-muted">{receipt.footerText}</p>}
      </article>

      <p className="no-print mt-6 text-xs text-[var(--nx-muted)]">
        Tip: in the print dialog, choose your USB/network thermal printer and disable headers/footers.
        Paper width setting: {receipt.paperWidthMm}mm. API host {API_URL}.
      </p>
    </div>
  );
}
