import { getDb } from "../db/schema.js";
import {
  dayBounds,
  financialYearBounds,
  monthBounds,
  type GstBreakdown,
} from "../lib/money-gst.js";
import { getGstSettings } from "./gst-settings.js";

type PaymentStatus = string;

export interface ReportTotals {
  from: string;
  to: string;
  period: "daily" | "monthly" | "financial_year" | "custom";
  label: string;
  shopId: string | null;
  successCount: number;
  failedCount: number;
  expiredCount: number;
  cancelledCount: number;
  paymentCount: number;
  totalSalesPaise: number;
  avgTicketPaise: number;
  gstCollectedPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxablePaise: number;
  refundsPaise: number;
}

export interface ChartPoint {
  key: string;
  label: string;
  value: number;
  secondary?: number;
}

interface AggRow {
  status: PaymentStatus;
  cnt: number;
  sales: number;
  tax: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxable: number;
}

function shopClause(shopId: string | null | undefined): { sql: string; params: string[] } {
  if (shopId) return { sql: " AND shop_id = ?", params: [shopId] };
  return { sql: "", params: [] };
}

export function getReportTotals(opts: {
  from: string;
  to: string;
  period: ReportTotals["period"];
  label: string;
  shopId?: string | null;
}): ReportTotals {
  const shop = shopClause(opts.shopId);
  const rows = getDb()
    .prepare(
      `SELECT status,
              COUNT(*) as cnt,
              COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN amount_paise ELSE 0 END), 0) as sales,
              COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN COALESCE(cgst_paise,0)+COALESCE(sgst_paise,0)+COALESCE(igst_paise,0) ELSE 0 END), 0) as tax,
              COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN COALESCE(cgst_paise,0) ELSE 0 END), 0) as cgst,
              COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN COALESCE(sgst_paise,0) ELSE 0 END), 0) as sgst,
              COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN COALESCE(igst_paise,0) ELSE 0 END), 0) as igst,
              COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN COALESCE(taxable_paise, amount_paise) ELSE 0 END), 0) as taxable
       FROM payments
       WHERE created_at >= ? AND created_at <= ?${shop.sql}
       GROUP BY status`
    )
    .all(opts.from, opts.to, ...shop.params) as AggRow[];

  const totals: ReportTotals = {
    from: opts.from,
    to: opts.to,
    period: opts.period,
    label: opts.label,
    shopId: opts.shopId ?? null,
    successCount: 0,
    failedCount: 0,
    expiredCount: 0,
    cancelledCount: 0,
    paymentCount: 0,
    totalSalesPaise: 0,
    avgTicketPaise: 0,
    gstCollectedPaise: 0,
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: 0,
    taxablePaise: 0,
    refundsPaise: 0,
  };

  for (const r of rows) {
    totals.paymentCount += r.cnt;
    if (r.status === "SUCCESS") {
      totals.successCount = r.cnt;
      totals.totalSalesPaise = r.sales;
      totals.gstCollectedPaise = r.tax;
      totals.cgstPaise = r.cgst;
      totals.sgstPaise = r.sgst;
      totals.igstPaise = r.igst;
      totals.taxablePaise = r.taxable;
    } else if (r.status === "FAILED") totals.failedCount = r.cnt;
    else if (r.status === "EXPIRED") totals.expiredCount = r.cnt;
    else if (r.status === "CANCELLED") totals.cancelledCount = r.cnt;
  }
  totals.avgTicketPaise =
    totals.successCount > 0 ? Math.round(totals.totalSalesPaise / totals.successCount) : 0;
  return totals;
}

export function resolvePeriod(opts: {
  period: "daily" | "monthly" | "financial_year";
  date?: string;
  year?: number;
  month?: number;
}): { from: string; to: string; label: string } {
  const gst = getGstSettings();
  if (opts.period === "daily") {
    const d = (opts.date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
    const b = dayBounds(d);
    return { ...b, label: d };
  }
  if (opts.period === "monthly") {
    const now = new Date();
    const y = opts.year ?? now.getUTCFullYear();
    const m = opts.month ?? now.getUTCMonth() + 1;
    const b = monthBounds(y, m);
    return { ...b, label: `${y}-${String(m).padStart(2, "0")}` };
  }
  const ref = opts.date ? new Date(opts.date) : new Date();
  const fy = financialYearBounds(ref, gst.fyStartMonth);
  return { from: fy.from.toISOString(), to: fy.to.toISOString(), label: fy.label };
}

export function chartByDayOfWeek(opts: {
  from: string;
  to: string;
  shopId?: string | null;
}): ChartPoint[] {
  const shop = shopClause(opts.shopId);
  const rows = getDb()
    .prepare(
      `SELECT CAST(strftime('%w', created_at) AS INTEGER) as dow,
              COUNT(*) as cnt,
              COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN amount_paise ELSE 0 END), 0) as sales
       FROM payments
       WHERE created_at >= ? AND created_at <= ?${shop.sql}
       GROUP BY dow`
    )
    .all(opts.from, opts.to, ...shop.params) as { dow: number; cnt: number; sales: number }[];

  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const map = new Map(rows.map((r) => [r.dow, r]));
  return labels.map((label, i) => {
    const r = map.get(i);
    return {
      key: String(i),
      label,
      value: r?.sales ?? 0,
      secondary: r?.cnt ?? 0,
    };
  });
}

export function chartByHour(opts: {
  from: string;
  to: string;
  shopId?: string | null;
}): ChartPoint[] {
  const shop = shopClause(opts.shopId);
  const rows = getDb()
    .prepare(
      `SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour,
              COUNT(*) as cnt,
              SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as ok
       FROM payments
       WHERE created_at >= ? AND created_at <= ?${shop.sql}
       GROUP BY hour`
    )
    .all(opts.from, opts.to, ...shop.params) as { hour: number; cnt: number; ok: number }[];

  const map = new Map(rows.map((r) => [r.hour, r]));
  return Array.from({ length: 24 }, (_, h) => {
    const r = map.get(h);
    return {
      key: String(h),
      label: `${String(h).padStart(2, "0")}:00`,
      value: r?.cnt ?? 0,
      secondary: r?.ok ?? 0,
    };
  });
}

export function chartSuccessTrend(opts: {
  from: string;
  to: string;
  shopId?: string | null;
}): ChartPoint[] {
  const shop = shopClause(opts.shopId);
  const rows = getDb()
    .prepare(
      `SELECT substr(created_at, 1, 10) as day,
              COUNT(*) as cnt,
              SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as ok
       FROM payments
       WHERE created_at >= ? AND created_at <= ?${shop.sql}
       GROUP BY day
       ORDER BY day ASC`
    )
    .all(opts.from, opts.to, ...shop.params) as { day: string; cnt: number; ok: number }[];

  return rows.map((r) => ({
    key: r.day,
    label: r.day.slice(5),
    value: r.cnt > 0 ? Math.round((r.ok / r.cnt) * 1000) / 10 : 0,
    secondary: r.cnt,
  }));
}

export function exportCsv(opts: {
  from: string;
  to: string;
  shopId?: string | null;
}): string {
  const shop = shopClause(opts.shopId);
  const rows = getDb()
    .prepare(
      `SELECT id, created_at, status, amount_paise, taxable_paise, cgst_paise, sgst_paise, igst_paise,
              gst_rate_percent, shop_id, merchant_order_id, note
       FROM payments
       WHERE created_at >= ? AND created_at <= ?${shop.sql}
       ORDER BY created_at ASC`
    )
    .all(opts.from, opts.to, ...shop.params) as Record<string, unknown>[];

  const header = [
    "id",
    "created_at",
    "status",
    "amount_paise",
    "taxable_paise",
    "cgst_paise",
    "sgst_paise",
    "igst_paise",
    "gst_rate_percent",
    "shop_id",
    "merchant_order_id",
    "note",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      header
        .map((h) => {
          const v = r[h];
          if (v == null) return "";
          const s = String(v);
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join(",")
    );
  }
  return lines.join("\n");
}

export function gstJsonExport(opts: {
  from: string;
  to: string;
  shopId?: string | null;
}): {
  format: "gstr1_shape_stub";
  from: string;
  to: string;
  settings: ReturnType<typeof getGstSettings>;
  totals: ReportTotals;
  note: string;
} {
  const totals = getReportTotals({
    from: opts.from,
    to: opts.to,
    period: "custom",
    label: "export",
    shopId: opts.shopId,
  });
  return {
    format: "gstr1_shape_stub",
    from: opts.from,
    to: opts.to,
    settings: getGstSettings(),
    totals,
    note: "Shape ready for future GSTR API — no live GSTN filing in Slice 1",
  };
}

export type { GstBreakdown };
