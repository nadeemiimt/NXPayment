import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getGstSettings, updateGstSettings } from "../services/gst-settings.js";
import { buildInsights } from "../services/insights.js";
import {
  chartByDayOfWeek,
  chartByHour,
  chartSuccessTrend,
  exportCsv,
  getReportTotals,
  gstJsonExport,
  resolvePeriod,
} from "../services/reports.js";
import { getActiveShop } from "../services/shops.js";

const gstUpdateSchema = z.object({
  ratePercent: z.number().min(0).max(100).optional(),
  splitMode: z.enum(["cgst_sgst", "igst"]).optional(),
  priceMode: z.enum(["inclusive", "exclusive"]).optional(),
  hsnCode: z.string().max(16).nullable().optional(),
  fyStartMonth: z.number().int().min(1).max(12).optional(),
});

function shopFromQuery(q: { shopId?: string }): string | null {
  if (q.shopId === "all") return null;
  if (q.shopId) return q.shopId;
  return getActiveShop()?.id ?? null;
}

export async function reportRoutes(app: FastifyInstance) {
  app.get("/api/merchant/gst-settings", async () => {
    return { gst: getGstSettings() };
  });

  app.put("/api/merchant/gst-settings", async (req, reply) => {
    const parsed = gstUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    return { gst: updateGstSettings(parsed.data) };
  });

  app.get("/api/merchant/reports", async (req) => {
    const q = req.query as {
      period?: string;
      date?: string;
      year?: string;
      month?: string;
      shopId?: string;
    };
    const period =
      q.period === "monthly" || q.period === "financial_year" ? q.period : "daily";
    const window = resolvePeriod({
      period,
      date: q.date,
      year: q.year ? Number(q.year) : undefined,
      month: q.month ? Number(q.month) : undefined,
    });
    const shopId = shopFromQuery(q);
    const totals = getReportTotals({
      from: window.from,
      to: window.to,
      period,
      label: window.label,
      shopId,
    });
    const charts = {
      byDayOfWeek: chartByDayOfWeek({ from: window.from, to: window.to, shopId }),
      byHour: chartByHour({ from: window.from, to: window.to, shopId }),
      successTrend: chartSuccessTrend({ from: window.from, to: window.to, shopId }),
    };
    return { totals, charts, gst: getGstSettings() };
  });

  app.get("/api/merchant/reports/csv", async (req, reply) => {
    const q = req.query as {
      period?: string;
      date?: string;
      year?: string;
      month?: string;
      shopId?: string;
      from?: string;
      to?: string;
    };
    const shopId = shopFromQuery(q);
    let from = q.from;
    let to = q.to;
    if (!from || !to) {
      const period =
        q.period === "monthly" || q.period === "financial_year" ? q.period : "daily";
      const window = resolvePeriod({
        period,
        date: q.date,
        year: q.year ? Number(q.year) : undefined,
        month: q.month ? Number(q.month) : undefined,
      });
      from = window.from;
      to = window.to;
    }
    const csv = exportCsv({ from: from!, to: to!, shopId });
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", 'attachment; filename="nxpayment-report.csv"')
      .send(csv);
  });

  app.get("/api/reports/gst-export", async (req) => {
    const q = req.query as { from?: string; to?: string; shopId?: string };
    const to = q.to ?? new Date().toISOString();
    const from =
      q.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    return gstJsonExport({ from, to, shopId: shopFromQuery(q) });
  });

  app.get("/api/merchant/insights", async (req) => {
    const q = req.query as { from?: string; to?: string; shopId?: string };
    return { insights: buildInsights({ from: q.from, to: q.to, shopId: shopFromQuery(q) }) };
  });
}
