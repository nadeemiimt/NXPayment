import { nanoid } from "nanoid";
import { config } from "../config.js";
import { getDb } from "../db/schema.js";
import {
  buildConfirmAssists,
  type ConfirmMatch,
  type ObservedCredit,
} from "../lib/confirm-scorer.js";
import { listPendingConfirms } from "./payments.js";

interface CreditRow {
  id: string;
  amount_paise: number;
  observed_at: string;
  utr: string | null;
  source: string | null;
  note: string | null;
  matched_payment_id: string | null;
  created_at: string;
}

export function recordObservedCredit(input: {
  amountPaise: number;
  observedAt?: string;
  utr?: string | null;
  source?: string | null;
  note?: string | null;
}): ObservedCredit & { id: string } {
  const id = `oc_${nanoid(10)}`;
  const now = new Date().toISOString();
  const observedAt = input.observedAt ?? now;
  getDb()
    .prepare(
      `INSERT INTO observed_credits (id, amount_paise, observed_at, utr, source, note, matched_payment_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`
    )
    .run(
      id,
      input.amountPaise,
      observedAt,
      input.utr ?? null,
      input.source ?? "manual",
      input.note ?? null,
      now
    );
  return {
    id,
    amountPaise: input.amountPaise,
    observedAt,
    utr: input.utr ?? null,
    source: input.source ?? "manual",
    note: input.note ?? null,
  };
}

export function listRecentCredits(limit = 50): ObservedCredit[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM observed_credits ORDER BY observed_at DESC LIMIT ?`
    )
    .all(limit) as CreditRow[];
  return rows.map((r) => ({
    id: r.id,
    amountPaise: r.amount_paise,
    observedAt: r.observed_at,
    utr: r.utr,
    source: r.source,
    note: r.note,
  }));
}

export interface PendingAssistDto {
  payment: ReturnType<typeof listPendingConfirms>[number];
  assist: ConfirmMatch;
}

export function getPendingWithAssists(): {
  payments: PendingAssistDto[];
  llmUsed: boolean;
  note: string;
} {
  const pending = listPendingConfirms();
  const amountCounts = new Map<number, number>();
  for (const p of pending) {
    amountCounts.set(p.amountPaise, (amountCounts.get(p.amountPaise) ?? 0) + 1);
  }

  const candidates = pending.map((p) => ({
    id: p.id,
    amountPaise: p.amountPaise,
    createdAt: p.createdAt,
    expiresAt: p.expiresAt,
    note: p.note,
    sameAmountCount: amountCounts.get(p.amountPaise) ?? 1,
  }));

  const credits = listRecentCredits(100);
  const assists = buildConfirmAssists(candidates, credits);
  const byId = new Map(assists.map((a) => [a.paymentId, a]));

  // Optional LLM: never invent — only if key+url present (same policy as insights)
  const llmUsed = false;
  let note =
    "Heuristic confirm assist — scores amount, time window, UTR presence, same-amount collisions.";
  if (config.insightsLlmKey && config.insightsLlmUrl) {
    note =
      "INSIGHTS_LLM_KEY set but confirm-assist LLM adapter not invoked — heuristics only (not claimed as LLM).";
  }

  return {
    payments: pending.map((p) => ({
      payment: p,
      assist: byId.get(p.id)!,
    })),
    llmUsed,
    note,
  };
}

export function markCreditMatched(creditId: string, paymentId: string): void {
  getDb()
    .prepare(`UPDATE observed_credits SET matched_payment_id = ? WHERE id = ?`)
    .run(paymentId, creditId);
}
