/** Loyalty points earn / redeem math — amounts in paise, points as integers. */

export type LoyaltyTier = "bronze" | "silver" | "gold" | "none";

export interface LoyaltyRules {
  /** Points awarded per 100 paise (₹1) spent. E.g. 1 = 1 point per rupee. */
  pointsPerRupee: number;
  /** Paise of discount per point when redeeming. E.g. 100 = ₹1 off per point. */
  paisePerPointRedeem: number;
  /** Lifetime spend (paise) thresholds for tiers. */
  silverThresholdPaise: number;
  goldThresholdPaise: number;
  /** Stamp-style: visits needed for a free-visit reward (0 = disabled). */
  stampVisitsRequired: number;
  /** Discount paise when stamp reward completes (optional). */
  stampRewardPaise: number;
}

export const DEFAULT_LOYALTY_RULES: LoyaltyRules = {
  pointsPerRupee: 1,
  paisePerPointRedeem: 100,
  silverThresholdPaise: 50_000_00, // ₹50,000
  goldThresholdPaise: 200_000_00, // ₹2,00,000
  stampVisitsRequired: 10,
  stampRewardPaise: 5000, // ₹50
};

export function earnPoints(amountPaise: number, rules: LoyaltyRules): number {
  if (amountPaise <= 0 || rules.pointsPerRupee <= 0) return 0;
  const rupees = amountPaise / 100;
  return Math.floor(rupees * rules.pointsPerRupee);
}

export function redeemValuePaise(points: number, rules: LoyaltyRules): number {
  if (points <= 0 || rules.paisePerPointRedeem <= 0) return 0;
  return points * rules.paisePerPointRedeem;
}

export function pointsNeededForDiscount(
  discountPaise: number,
  rules: LoyaltyRules
): number {
  if (discountPaise <= 0 || rules.paisePerPointRedeem <= 0) return 0;
  return Math.ceil(discountPaise / rules.paisePerPointRedeem);
}

export function applyRedeem(opts: {
  amountPaise: number;
  pointsToRedeem: number;
  availablePoints: number;
  rules: LoyaltyRules;
}): {
  pointsRedeemed: number;
  discountPaise: number;
  payablePaise: number;
  pointsRemaining: number;
} {
  const want = Math.max(0, Math.trunc(opts.pointsToRedeem));
  const available = Math.max(0, Math.trunc(opts.availablePoints));
  const use = Math.min(want, available);
  let discount = redeemValuePaise(use, opts.rules);
  if (discount > opts.amountPaise) {
    // Cap redeem so payable never goes negative; reduce points used
    const maxPoints = pointsNeededForDiscount(opts.amountPaise, opts.rules);
    const capped = Math.min(use, maxPoints);
    discount = Math.min(opts.amountPaise, redeemValuePaise(capped, opts.rules));
    return {
      pointsRedeemed: capped,
      discountPaise: discount,
      payablePaise: opts.amountPaise - discount,
      pointsRemaining: available - capped,
    };
  }
  return {
    pointsRedeemed: use,
    discountPaise: discount,
    payablePaise: opts.amountPaise - discount,
    pointsRemaining: available - use,
  };
}

export function tierFromLifetimeSpend(
  lifetimeSpendPaise: number,
  rules: LoyaltyRules
): LoyaltyTier {
  if (lifetimeSpendPaise >= rules.goldThresholdPaise) return "gold";
  if (lifetimeSpendPaise >= rules.silverThresholdPaise) return "silver";
  if (lifetimeSpendPaise > 0) return "bronze";
  return "none";
}

export function stampProgress(
  visitCount: number,
  rules: LoyaltyRules
): { visits: number; required: number; rewardReady: boolean } {
  const required = Math.max(0, rules.stampVisitsRequired);
  if (required <= 0) return { visits: visitCount, required: 0, rewardReady: false };
  const inCycle = visitCount % required;
  return {
    visits: inCycle === 0 && visitCount > 0 ? required : inCycle,
    required,
    rewardReady: visitCount > 0 && visitCount % required === 0,
  };
}
