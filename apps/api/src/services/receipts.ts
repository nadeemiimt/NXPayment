import { getDb } from "../db/schema.js";
import {
  centerLine,
  charsPerLine,
  encodeEscPosReceipt,
  formatInrPlain,
  moneyLine,
  separator,
  type PaperWidthMm,
} from "../lib/escpos.js";
import { getMerchantConfig } from "./merchant.js";
import { getShop } from "./shops.js";

export type { PaperWidthMm };

export interface ReceiptSettingsDto {
  paperWidthMm: PaperWidthMm;
  headerText: string | null;
  footerText: string | null;
  thankYouText: string | null;
  updatedAt: string;
  /** Local USB/network bridge for silent ESC/POS — Slice 1 stub. */
  printBridge: {
    status: "stub";
    note: string;
  };
}

interface ReceiptSettingsRow {
  paper_width_mm: number;
  header_text: string | null;
  footer_text: string | null;
  thank_you_text: string | null;
  updated_at: string;
}

export interface ReceiptLineItem {
  label: string;
  amountPaise: number | null;
  meta?: string;
}

export interface ReceiptDto {
  paymentId: string;
  shopName: string;
  brandName: string;
  printedAt: string;
  paymentAt: string;
  status: string;
  amountPaise: number;
  note: string | null;
  merchantOrderId: string | null;
  receivingVpa: string;
  /** UTR / bank ref if captured later — Slice 1 usually null */
  utr: string | null;
  upiRef: string | null;
  gst: {
    ratePercent: number | null;
    taxablePaise: number | null;
    cgstPaise: number | null;
    sgstPaise: number | null;
    igstPaise: number | null;
  } | null;
  lines: ReceiptLineItem[];
  headerText: string | null;
  footerText: string | null;
  thankYouText: string | null;
  paperWidthMm: PaperWidthMm;
  textLines: string[];
  printBridge: ReceiptSettingsDto["printBridge"];
}

export function getReceiptSettings(): ReceiptSettingsDto {
  const row = getDb()
    .prepare("SELECT * FROM receipt_settings WHERE id = 1")
    .get() as ReceiptSettingsRow;
  return {
    paperWidthMm: (row.paper_width_mm === 80 ? 80 : 58) as PaperWidthMm,
    headerText: row.header_text,
    footerText: row.footer_text,
    thankYouText: row.thank_you_text,
    updatedAt: row.updated_at,
    printBridge: {
      status: "stub",
      note: "Silent ESC/POS via local USB/network bridge is not wired in Slice 1 — use browser Print or download .bin",
    },
  };
}

export function updateReceiptSettings(input: {
  paperWidthMm?: PaperWidthMm;
  headerText?: string | null;
  footerText?: string | null;
  thankYouText?: string | null;
}): ReceiptSettingsDto {
  const current = getReceiptSettings();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE receipt_settings SET
        paper_width_mm = ?, header_text = ?, footer_text = ?, thank_you_text = ?, updated_at = ?
       WHERE id = 1`
    )
    .run(
      input.paperWidthMm ?? current.paperWidthMm,
      input.headerText !== undefined ? input.headerText : current.headerText,
      input.footerText !== undefined ? input.footerText : current.footerText,
      input.thankYouText !== undefined ? input.thankYouText : current.thankYouText,
      now
    );
  return getReceiptSettings();
}

interface PaymentReceiptRow {
  id: string;
  merchant_order_id: string | null;
  amount_paise: number;
  status: string;
  note: string | null;
  receiving_vpa: string;
  receiving_name: string;
  created_at: string;
  confirmed_at: string | null;
  shop_id: string | null;
  taxable_paise: number | null;
  cgst_paise: number | null;
  sgst_paise: number | null;
  igst_paise: number | null;
  gst_rate_percent: number | null;
}

export function buildReceipt(paymentId: string): ReceiptDto | null {
  const row = getDb()
    .prepare(`SELECT * FROM payments WHERE id = ?`)
    .get(paymentId) as PaymentReceiptRow | undefined;
  if (!row) return null;

  const settings = getReceiptSettings();
  const merchant = getMerchantConfig();
  const shop = row.shop_id ? getShop(row.shop_id) : null;
  const shopName = shop?.name || row.receiving_name || merchant.displayName;
  const width = charsPerLine(settings.paperWidthMm);
  const printedAt = new Date().toISOString();
  const paymentAt = row.confirmed_at ?? row.created_at;

  const saleRows = getDb()
    .prepare(
      `SELECT label, amount_paise, sale_mode, qty, weight_unit, rate_paise
       FROM sale_lines WHERE payment_id = ? ORDER BY created_at ASC`
    )
    .all(paymentId) as Array<{
    label: string;
    amount_paise: number;
    sale_mode: string;
    qty: number;
    weight_unit: string | null;
    rate_paise: number;
  }>;

  const lines: ReceiptLineItem[] = [];
  if (saleRows.length > 0) {
    for (const s of saleRows) {
      const meta =
        s.sale_mode === "weight" && s.weight_unit
          ? `${s.qty} ${s.weight_unit} × Rs ${(s.rate_paise / 100).toFixed(2)}/${s.weight_unit}`
          : undefined;
      lines.push({ label: s.label, amountPaise: s.amount_paise, meta });
    }
  } else if (row.note) {
    lines.push({ label: row.note, amountPaise: row.amount_paise });
  } else {
    lines.push({ label: "Sale / UPI payment", amountPaise: row.amount_paise });
  }

  const hasGst =
    row.taxable_paise != null ||
    row.cgst_paise != null ||
    row.sgst_paise != null ||
    row.igst_paise != null;

  const gst = hasGst
    ? {
        ratePercent: row.gst_rate_percent,
        taxablePaise: row.taxable_paise,
        cgstPaise: row.cgst_paise,
        sgstPaise: row.sgst_paise,
        igstPaise: row.igst_paise,
      }
    : null;

  const textLines: string[] = [];
  if (settings.headerText) textLines.push(centerLine(settings.headerText, width));
  textLines.push(centerLine(shopName, width));
  textLines.push(centerLine(merchant.brandName, width));
  textLines.push(separator(width));
  textLines.push(centerLine(new Date(paymentAt).toLocaleString("en-IN"), width));
  textLines.push(`Status: ${row.status}`.slice(0, width));
  textLines.push(`Txn: ${row.id}`.slice(0, width));
  if (row.merchant_order_id) {
    textLines.push(`Order: ${row.merchant_order_id}`.slice(0, width));
  }
  textLines.push(separator(width));

  for (const item of lines) {
    if (item.meta) textLines.push(item.meta.slice(0, width));
    if (item.amountPaise != null) {
      textLines.push(moneyLine(item.label.slice(0, 16), item.amountPaise, width));
    } else {
      textLines.push(item.label.slice(0, width));
    }
  }

  if (gst) {
    textLines.push(separator(width));
    if (gst.taxablePaise != null) {
      textLines.push(moneyLine("Taxable", gst.taxablePaise, width));
    }
    if (gst.cgstPaise) textLines.push(moneyLine("CGST", gst.cgstPaise, width));
    if (gst.sgstPaise) textLines.push(moneyLine("SGST", gst.sgstPaise, width));
    if (gst.igstPaise) textLines.push(moneyLine("IGST", gst.igstPaise, width));
    if (gst.ratePercent != null) {
      textLines.push(`GST ${gst.ratePercent}%`.slice(0, width));
    }
  }

  textLines.push(separator(width));
  textLines.push(moneyLine("TOTAL", row.amount_paise, width));
  textLines.push(`UPI: ${row.receiving_vpa}`.slice(0, width));
  // UTR not captured in Slice 1 payment model — leave null; show placeholder only if present
  textLines.push(separator(width));
  const thanks = settings.thankYouText || "Thank you! Visit again.";
  textLines.push(centerLine(thanks, width));
  if (settings.footerText) textLines.push(centerLine(settings.footerText, width));

  return {
    paymentId: row.id,
    shopName,
    brandName: merchant.brandName,
    printedAt,
    paymentAt,
    status: row.status,
    amountPaise: row.amount_paise,
    note: row.note,
    merchantOrderId: row.merchant_order_id,
    receivingVpa: row.receiving_vpa,
    utr: null,
    upiRef: row.id,
    gst,
    lines,
    headerText: settings.headerText,
    footerText: settings.footerText,
    thankYouText: settings.thankYouText,
    paperWidthMm: settings.paperWidthMm,
    textLines,
    printBridge: settings.printBridge,
  };
}

export function buildEscPosBinary(paymentId: string): Buffer | null {
  const receipt = buildReceipt(paymentId);
  if (!receipt) return null;
  return encodeEscPosReceipt({
    lines: receipt.textLines,
    widthMm: receipt.paperWidthMm,
    cut: true,
  });
}

/** Stub: would POST bytes to a local agent. Always returns not_connected in Slice 1. */
export function sendToPrintBridge(_paymentId: string): {
  ok: false;
  status: "stub_not_connected";
  message: string;
} {
  return {
    ok: false,
    status: "stub_not_connected",
    message:
      "Local ESC/POS print bridge is a Slice 1 stub. Use browser Print or download the .bin file.",
  };
}

export { formatInrPlain };
