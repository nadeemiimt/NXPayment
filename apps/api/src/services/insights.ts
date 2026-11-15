import { getDb } from "../db/schema.js";
import { config } from "../config.js";

export interface InsightPattern {
  id: string;
  title: string;
  detail: string;
  metric?: string;
}

export interface InsightRecommendation {
  id: string;
  kind: "focus" | "deprioritize";
  title: string;
  reason: string;
  source: "heuristic" | "llm";
}

export interface InsightsDto {
  from: string;
  to: string;
  shopId: string | null;
  patterns: InsightPattern[];
  recommendations: InsightRecommendation[];
  llmEnabled: boolean;
  llmUsed: boolean;
  note: string;
}

interface PaymentLite {
  amount_paise: number;
  status: string;
  created_at: string;
}

function shopClause(shopId: string | null | undefined): { sql: string; params: string[] } {
  if (shopId) return { sql: " AND shop_id = ?", params: [shopId] };
  return { sql: "", params: [] };
}

function hourOf(iso: string): number {
  return new Date(iso).getUTCHours();
}

function dowOf(iso: string): number {
  return new Date(iso).getUTCDay();
}

export function buildInsights(opts: {
  from?: string;
  to?: string;
  shopId?: string | null;
}): InsightsDto {
  const to = opts.to ?? new Date().toISOString();
  const from =
    opts.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const shop = shopClause(opts.shopId);

  const rows = getDb()
    .prepare(
      `SELECT amount_paise, status, created_at FROM payments
       WHERE created_at >= ? AND created_at <= ?${shop.sql}`
    )
    .all(from, to, ...shop.params) as PaymentLite[];

  const patterns: InsightPattern[] = [];
  const recommendations: InsightRecommendation[] = [];

  if (rows.length === 0) {
    patterns.push({
      id: "no_data",
      title: "Not enough payments yet",
      detail: "Create a few checkouts and confirm them — patterns appear after activity.",
    });
    recommendations.push({
      id: "start_checkout",
      kind: "focus",
      title: "Run a few real or test payments",
      reason: "Insights need at least a handful of settled sessions to spot peaks.",
      source: "heuristic",
    });
    return {
      from,
      to,
      shopId: opts.shopId ?? null,
      patterns,
      recommendations,
      llmEnabled: Boolean(config.insightsLlmKey),
      llmUsed: false,
      note: "Heuristic engine only — no LLM call made.",
    };
  }

  // Peak / slow hours
  const hourCounts = new Map<number, number>();
  const hourSuccess = new Map<number, number>();
  const dowCounts = new Map<number, { total: number; success: number }>();
  const amountBuckets = new Map<number, number>();
  let expired = 0;
  let success = 0;
  let total = rows.length;

  for (const r of rows) {
    const h = hourOf(r.created_at);
    hourCounts.set(h, (hourCounts.get(h) ?? 0) + 1);
    if (r.status === "SUCCESS") {
      hourSuccess.set(h, (hourSuccess.get(h) ?? 0) + 1);
      success++;
    }
    if (r.status === "EXPIRED") expired++;
    const d = dowOf(r.created_at);
    const cur = dowCounts.get(d) ?? { total: 0, success: 0 };
    cur.total++;
    if (r.status === "SUCCESS") cur.success++;
    dowCounts.set(d, cur);
    if (r.status === "SUCCESS" || r.status === "ACTIVE" || r.status === "PROCESSING") {
      amountBuckets.set(r.amount_paise, (amountBuckets.get(r.amount_paise) ?? 0) + 1);
    }
  }

  const sortedHours = [...hourCounts.entries()].sort((a, b) => b[1] - a[1]);
  const peak = sortedHours[0];
  const slow = [...hourCounts.entries()].sort((a, b) => a[1] - b[1])[0];

  if (peak) {
    patterns.push({
      id: "peak_hour",
      title: "Peak hour",
      detail: `Most sessions land around ${String(peak[0]).padStart(2, "0")}:00 UTC (${peak[1]} payments).`,
      metric: `${peak[1]} txns`,
    });
    recommendations.push({
      id: "focus_peak",
      kind: "focus",
      title: `Staff the counter near ${String(peak[0]).padStart(2, "0")}:00`,
      reason: "Peak traffic — keep Display kiosk + Confirm screen ready.",
      source: "heuristic",
    });
  }

  if (slow && peak && slow[0] !== peak[0] && slow[1] < peak[1]) {
    patterns.push({
      id: "slow_hour",
      title: "Slow period",
      detail: `Quietest sampled hour is ${String(slow[0]).padStart(2, "0")}:00 UTC (${slow[1]} payments).`,
      metric: `${slow[1]} txns`,
    });
    recommendations.push({
      id: "deprioritize_slow",
      kind: "deprioritize",
      title: `Avoid stocking rushes at ${String(slow[0]).padStart(2, "0")}:00`,
      reason: "Low footfall window — better for inventory counts than checkout pressure.",
      source: "heuristic",
    });
  }

  // Same-amount collisions
  const colliding = [...amountBuckets.entries()].filter(([, c]) => c >= 3);
  if (colliding.length > 0) {
    colliding.sort((a, b) => b[1] - a[1]);
    const [amt, cnt] = colliding[0]!;
    patterns.push({
      id: "same_amount",
      title: "Same-amount collisions",
      detail: `₹${(amt / 100).toFixed(2)} appeared ${cnt} times — FIFO same-amount guard may warn often.`,
      metric: `${cnt}×`,
    });
    recommendations.push({
      id: "deprioritize_same_amount",
      kind: "deprioritize",
      title: "Avoid stacking identical ticket amounts",
      reason: "Same-amount in-progress returns 409 unless confirmDuplicate — stagger or add note.",
      source: "heuristic",
    });
  }

  const timeoutRate = total > 0 ? expired / total : 0;
  patterns.push({
    id: "timeout_rate",
    title: "Timeout rate",
    detail: `${expired} of ${total} sessions expired (${(timeoutRate * 100).toFixed(1)}%).`,
    metric: `${(timeoutRate * 100).toFixed(1)}%`,
  });
  if (timeoutRate >= 0.15) {
    recommendations.push({
      id: "focus_timeouts",
      kind: "focus",
      title: "Cut expired checkouts",
      reason: "High TTL expiry — shorten queue time or raise PAYMENT_TTL_MS for slow counters.",
      source: "heuristic",
    });
  }

  let weekday = 0;
  let weekend = 0;
  for (const [d, v] of dowCounts) {
    if (d === 0 || d === 6) weekend += v.total;
    else weekday += v.total;
  }
  patterns.push({
    id: "weekday_weekend",
    title: "Weekday vs weekend",
    detail: `Weekday sessions ${weekday}, weekend ${weekend}.`,
    metric: `${weekday}:${weekend}`,
  });
  if (weekend > weekday * 0.6 && weekend > 0) {
    recommendations.push({
      id: "focus_weekend",
      kind: "focus",
      title: "Lean into weekend Display uptime",
      reason: "Weekend volume is meaningful relative to weekdays.",
      source: "heuristic",
    });
  } else if (weekday > weekend * 2) {
    recommendations.push({
      id: "deprioritize_weekend_stock",
      kind: "deprioritize",
      title: "Don't over-prep weekend SKUs from payment patterns alone",
      reason: "Most payment activity is weekday — validate with inventory turns.",
      source: "heuristic",
    });
  }

  patterns.push({
    id: "success_share",
    title: "Success share",
    detail: `${success} successful of ${total} payments.`,
    metric: `${total > 0 ? ((success / total) * 100).toFixed(1) : 0}%`,
  });

  // Cap recommendations
  const focus = recommendations.filter((r) => r.kind === "focus").slice(0, 3);
  const deprioritize = recommendations.filter((r) => r.kind === "deprioritize").slice(0, 3);
  const trimmed = [...focus, ...deprioritize];

  const llmEnabled = Boolean(config.insightsLlmKey);
  let llmUsed = false;
  let note = "Heuristic pattern engine — recommendations are deterministic.";

  if (llmEnabled) {
    // Optional adapter: only call if key present. Without a real provider URL we stay heuristic.
    // Never send VPA/tokens — aggregates only. Slice 1 does not invent LLM prose when the call isn't made.
    const summarized = maybeLlmSummarize({
      patterns,
      success,
      total,
      timeoutRate,
    });
    if (summarized) {
      llmUsed = true;
      note = "LLM adapter returned a summary overlay; base patterns remain heuristic.";
      trimmed.unshift(...summarized);
    } else {
      note =
        "INSIGHTS_LLM_KEY is set but no provider completed a call — showing heuristics only (not claimed as LLM).";
    }
  }

  return {
    from,
    to,
    shopId: opts.shopId ?? null,
    patterns,
    recommendations: trimmed.slice(0, 6),
    llmEnabled,
    llmUsed,
    note,
  };
}

/** Best-effort optional LLM — returns null unless a real response is available. */
function maybeLlmSummarize(_agg: {
  patterns: InsightPattern[];
  success: number;
  total: number;
  timeoutRate: number;
}): InsightRecommendation[] | null {
  // Slice 1: do not call external APIs without an explicit provider endpoint.
  // Key presence alone must not fabricate LLM output.
  if (!config.insightsLlmKey || !config.insightsLlmUrl) return null;
  return null;
}
