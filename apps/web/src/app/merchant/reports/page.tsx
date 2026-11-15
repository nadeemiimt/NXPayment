"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type ChartPoint,
  type GstSettings,
  type ReportTotals,
} from "@/lib/api";
import { formatInr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SimpleBarChart } from "@/components/simple-bar-chart";

export default function ReportsPage() {
  const [period, setPeriod] = useState<"daily" | "monthly" | "financial_year">("daily");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [totals, setTotals] = useState<ReportTotals | null>(null);
  const [byDow, setByDow] = useState<ChartPoint[]>([]);
  const [byHour, setByHour] = useState<ChartPoint[]>([]);
  const [trend, setTrend] = useState<ChartPoint[]>([]);
  const [gst, setGst] = useState<GstSettings | null>(null);
  const [rate, setRate] = useState("18");
  const [splitMode, setSplitMode] = useState<"cgst_sgst" | "igst">("cgst_sgst");
  const [priceMode, setPriceMode] = useState<"inclusive" | "exclusive">("inclusive");
  const [scope, setScope] = useState<"active" | "all">("active");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api.reports({
      period,
      date,
      shopId: scope === "all" ? "all" : undefined,
    });
    setTotals(r.totals);
    setByDow(r.charts.byDayOfWeek);
    setByHour(r.charts.byHour);
    setTrend(r.charts.successTrend);
    setGst(r.gst);
    setRate(String(r.gst.ratePercent));
    setSplitMode(r.gst.splitMode);
    setPriceMode(r.gst.priceMode);
  }, [period, date, scope]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
    const onChange = () => load().catch(() => undefined);
    window.addEventListener("nx-shop-changed", onChange);
    return () => window.removeEventListener("nx-shop-changed", onChange);
  }, [load]);

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Reports</h1>
      <p className="mt-2 max-w-2xl text-[var(--nx-muted)]">
        Daily / monthly / India FY (Apr–Mar) aggregates with GST snapshot. Filter one shop or org
        roll-up across all outlets.
      </p>
      {error && <p className="mt-3 text-sm text-[#9B2C2C]">{error}</p>}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          type="button"
          size="sm"
          variant={scope === "active" ? "default" : "outline"}
          onClick={() => setScope("active")}
        >
          Active shop
        </Button>
        <Button
          type="button"
          size="sm"
          variant={scope === "all" ? "default" : "outline"}
          onClick={() => setScope("all")}
        >
          All shops (org)
        </Button>
        {(["daily", "monthly", "financial_year"] as const).map((p) => (
          <Button
            key={p}
            type="button"
            size="sm"
            variant={period === p ? "default" : "outline"}
            onClick={() => setPeriod(p)}
          >
            {p === "financial_year" ? "Financial year" : p[0]!.toUpperCase() + p.slice(1)}
          </Button>
        ))}
        <Input
          type="date"
          className="w-auto"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Button asChild size="sm" variant="secondary">
          <a
            href={api.reportsCsvUrl({
              period,
              date,
              shopId: scope === "all" ? "all" : undefined,
            })}
            download
          >
            CSV export
          </a>
        </Button>
      </div>

      {totals && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Sales" value={formatInr(totals.totalSalesPaise)} accent />
          <Metric label="Success" value={String(totals.successCount)} />
          <Metric label="Failed" value={String(totals.failedCount)} />
          <Metric label="GST collected" value={formatInr(totals.gstCollectedPaise)} />
          <Metric label="Avg ticket" value={formatInr(totals.avgTicketPaise)} />
          <Metric label="Expired" value={String(totals.expiredCount)} />
          <Metric label="CGST" value={formatInr(totals.cgstPaise)} />
          <Metric label="SGST / IGST" value={formatInr(totals.sgstPaise + totals.igstPaise)} />
        </div>
      )}
      {totals && (
        <p className="mt-3 text-sm text-[var(--nx-muted)]">
          Period {totals.label} · {totals.from.slice(0, 10)} → {totals.to.slice(0, 10)}
        </p>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <SimpleBarChart
          title="Sales by day of week"
          points={byDow}
          formatValue={(n) => formatInr(n)}
        />
        <SimpleBarChart title="Sessions by hour (UTC)" points={byHour} />
      </div>
      {trend.length > 0 && (
        <div className="mt-10">
          <SimpleBarChart title="Success rate trend (%)" points={trend} />
        </div>
      )}

      <h2 className="font-display mt-12 text-2xl">GST settings</h2>
      <form
        className="mt-4 grid max-w-xl gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          await api.updateGst({
            ratePercent: Number(rate),
            splitMode,
            priceMode,
          });
          await load();
        }}
      >
        <Input
          type="number"
          step="0.01"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="Rate %"
        />
        <select
          className="h-11 rounded-md border border-[var(--nx-line)] bg-white/80 px-3"
          value={splitMode}
          onChange={(e) => setSplitMode(e.target.value as "cgst_sgst" | "igst")}
        >
          <option value="cgst_sgst">CGST / SGST</option>
          <option value="igst">IGST</option>
        </select>
        <select
          className="h-11 rounded-md border border-[var(--nx-line)] bg-white/80 px-3"
          value={priceMode}
          onChange={(e) => setPriceMode(e.target.value as "inclusive" | "exclusive")}
        >
          <option value="inclusive">Inclusive</option>
          <option value="exclusive">Exclusive</option>
        </select>
        <Button type="submit">Save GST</Button>
      </form>
      {gst && (
        <p className="mt-2 text-sm text-[var(--nx-muted)]">
          FY start month {gst.fyStartMonth} (India default Apr). Tax snapshotted on Confirm.
        </p>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="border-b border-[var(--nx-line)] pb-3">
      <p className="text-xs uppercase tracking-wider text-[var(--nx-muted)]">{label}</p>
      <p className={`font-display mt-1 text-2xl ${accent ? "text-[var(--nx-accent)]" : ""}`}>
        {value}
      </p>
    </div>
  );
}
