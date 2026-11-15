/** Heuristic scorer: match observed bank credits to open UPI payments. */

export interface ObservedCredit {
  id?: string;
  amountPaise: number;
  observedAt: string;
  utr?: string | null;
  source?: string | null;
  note?: string | null;
}

export interface OpenPaymentCandidate {
  id: string;
  amountPaise: number;
  createdAt: string;
  expiresAt: string;
  note?: string | null;
  sameAmountCount: number;
}

export type MatchConfidence = "high" | "medium" | "low" | "none";

export interface ConfirmMatch {
  paymentId: string;
  creditId: string | null;
  score: number;
  confidence: MatchConfidence;
  reasons: string[];
  sameAmountCollision: boolean;
  sameAmountCount: number;
  recommendConfirm: boolean;
}

function minutesBetween(aIso: string, bIso: string): number {
  return Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime()) / 60_000;
}

export function confidenceFromScore(score: number): MatchConfidence {
  if (score >= 80) return "high";
  if (score >= 55) return "medium";
  if (score >= 30) return "low";
  return "none";
}

/**
 * Score one credit against one open payment.
 * Factors: exact/near amount, time proximity, optional UTR presence, same-amount collisions.
 */
export function scoreCreditAgainstPayment(
  credit: ObservedCredit,
  payment: OpenPaymentCandidate,
  opts?: { windowMinutes?: number }
): ConfirmMatch {
  const windowMinutes = opts?.windowMinutes ?? 30;
  const reasons: string[] = [];
  let score = 0;

  const amountDelta = Math.abs(credit.amountPaise - payment.amountPaise);
  if (amountDelta === 0) {
    score += 55;
    reasons.push("exact_amount");
  } else if (amountDelta <= 100) {
    // ≤ ₹1
    score += 35;
    reasons.push("near_amount_1r");
  } else if (amountDelta <= 500) {
    score += 15;
    reasons.push("near_amount_5r");
  } else {
    reasons.push("amount_mismatch");
  }

  const mins = minutesBetween(credit.observedAt, payment.createdAt);
  if (mins <= 5) {
    score += 30;
    reasons.push("within_5m");
  } else if (mins <= windowMinutes) {
    score += 18;
    reasons.push(`within_${windowMinutes}m`);
  } else if (mins <= windowMinutes * 2) {
    score += 5;
    reasons.push("stale_window");
  } else {
    reasons.push("outside_window");
  }

  if (credit.utr && credit.utr.trim().length >= 8) {
    score += 10;
    reasons.push("utr_present");
  }

  const sameAmountCollision = payment.sameAmountCount > 1;
  if (sameAmountCollision) {
    score = Math.max(0, score - 20);
    reasons.push("same_amount_collision");
  }

  score = Math.max(0, Math.min(100, score));
  const confidence = confidenceFromScore(score);

  return {
    paymentId: payment.id,
    creditId: credit.id ?? null,
    score,
    confidence,
    reasons,
    sameAmountCollision,
    sameAmountCount: payment.sameAmountCount,
    recommendConfirm: confidence === "high" || confidence === "medium",
  };
}

/** Best credit match per open payment (or empty assist if no credits). */
export function buildConfirmAssists(
  payments: OpenPaymentCandidate[],
  credits: ObservedCredit[]
): ConfirmMatch[] {
  return payments.map((payment) => {
    if (credits.length === 0) {
      return {
        paymentId: payment.id,
        creditId: null,
        score: payment.sameAmountCount > 1 ? 20 : 40,
        confidence: payment.sameAmountCount > 1 ? "low" : "low",
        reasons:
          payment.sameAmountCount > 1
            ? ["no_credit_observed", "same_amount_collision"]
            : ["no_credit_observed"],
        sameAmountCollision: payment.sameAmountCount > 1,
        sameAmountCount: payment.sameAmountCount,
        recommendConfirm: false,
      };
    }
    let best: ConfirmMatch | null = null;
    for (const credit of credits) {
      const m = scoreCreditAgainstPayment(credit, payment);
      if (!best || m.score > best.score) best = m;
    }
    return best!;
  });
}
