import { nanoid } from "nanoid";
import { IN_PROGRESS_STATUSES } from "../../../../packages/shared/src/index.ts";
import { getDb } from "../db/schema.js";

export interface RiskSignals {
  velocity5m: number;
  sameAmountOpen: number;
  recentFailed: number;
  observerMismatch?: boolean;
  fifoOverride?: boolean;
  tillMethod?: boolean;
  largeAmount?: boolean;
}

/** Pluggable risk model — returns 0–100. */
export function computeRiskScore(signals: RiskSignals): number {
  let score = 0;
  if (signals.velocity5m >= 5) score += 35;
  else if (signals.velocity5m >= 3) score += 20;
  else if (signals.velocity5m >= 2) score += 10;

  if (signals.sameAmountOpen >= 2) score += 40;
  else if (signals.sameAmountOpen === 1) score += 15;

  if (signals.recentFailed >= 3) score += 20;
  else if (signals.recentFailed >= 1) score += 8;

  if (signals.observerMismatch) score += 25;
  if (signals.fifoOverride) score += 10;
  if (signals.largeAmount) score += 12;
  // Till desk cash/card is lower digital fraud risk but still worth a light flag.
  if (signals.tillMethod) score += 5;

  return Math.min(100, score);
}

export function gatherCreateSignals(amountPaise: number, fifoOverride: boolean): RiskSignals {
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const placeholders = IN_PROGRESS_STATUSES.map(() => "?").join(",");
  const velocity5m = (
    getDb()
      .prepare(`SELECT COUNT(*) as c FROM payments WHERE created_at >= ?`)
      .get(since) as { c: number }
  ).c;
  const sameAmountOpen = (
    getDb()
      .prepare(
        `SELECT COUNT(*) as c FROM payments WHERE amount_paise = ? AND status IN (${placeholders})`
      )
      .get(amountPaise, ...IN_PROGRESS_STATUSES) as { c: number }
  ).c;
  const recentFailed = (
    getDb()
      .prepare(
        `SELECT COUNT(*) as c FROM payments WHERE status = 'FAILED' AND created_at >= ?`
      )
      .get(since) as { c: number }
  ).c;
  return {
    velocity5m,
    sameAmountOpen,
    recentFailed,
    fifoOverride,
    largeAmount: amountPaise >= 50_000_00, // ≥ ₹50,000
  };
}

export function persistPaymentRisk(
  paymentId: string,
  score: number,
  signals: RiskSignals
): void {
  getDb()
    .prepare(`UPDATE payments SET risk_score = ?, risk_signals = ? WHERE id = ?`)
    .run(score, JSON.stringify(signals), paymentId);
}

export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertRow {
  id: string;
  kind: string;
  severity: string;
  title: string;
  body: string | null;
  paymentId: string | null;
  read: number;
  dismissed: number;
  createdAt: string;
}

export function pushAlert(input: {
  kind: string;
  severity: AlertSeverity;
  title: string;
  body?: string;
  paymentId?: string;
}): string {
  const id = nanoid(12);
  getDb()
    .prepare(
      `INSERT INTO merchant_alerts (id, kind, severity, title, body, payment_id, read, dismissed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)`
    )
    .run(
      id,
      input.kind,
      input.severity,
      input.title,
      input.body ?? null,
      input.paymentId ?? null,
      new Date().toISOString()
    );
  return id;
}

export function listAlerts(opts?: {
  limit?: number;
  unreadOnly?: boolean;
  includeDismissed?: boolean;
}): AlertRow[] {
  const limit = opts?.limit ?? 50;
  const clauses: string[] = [];
  if (!opts?.includeDismissed) clauses.push("dismissed = 0");
  if (opts?.unreadOnly) clauses.push("read = 0");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return getDb()
    .prepare(
      `SELECT id, kind, severity, title, body, payment_id as paymentId, read,
              dismissed, created_at as createdAt
       FROM merchant_alerts ${where}
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as AlertRow[];
}

export function unreadAlertCount(): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as c FROM merchant_alerts WHERE read = 0 AND dismissed = 0`
    )
    .get() as { c: number };
  return row.c;
}

export function markAlertRead(id: string): boolean {
  const result = getDb()
    .prepare(`UPDATE merchant_alerts SET read = 1 WHERE id = ? AND dismissed = 0`)
    .run(id);
  return result.changes > 0;
}

export function markAllAlertsRead(): number {
  const result = getDb()
    .prepare(`UPDATE merchant_alerts SET read = 1 WHERE read = 0 AND dismissed = 0`)
    .run();
  return result.changes;
}

export function dismissAlert(id: string): boolean {
  const result = getDb()
    .prepare(
      `UPDATE merchant_alerts SET dismissed = 1, read = 1 WHERE id = ?`
    )
    .run(id);
  return result.changes > 0;
}

export function maybeAlertHighRisk(paymentId: string, score: number) {
  if (score < 60) return;
  pushAlert({
    kind: "high_risk",
    severity: score >= 80 ? "critical" : "warning",
    title: `High risk score ${score}`,
    body: "Review this payment before confirming or shipping goods.",
    paymentId,
  });
}
