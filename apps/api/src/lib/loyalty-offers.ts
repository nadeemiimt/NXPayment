/** Heuristic next-best loyalty offer from RFM + purchase gaps. */

export type OfferKind = "discount_paise" | "points_bonus";

export interface OfferCustomerInput {
  id: string;
  points: number;
  lifetimeSpendPaise: number;
  visitCount: number;
  daysSinceLastPurchase: number | null;
  tier: string;
  stamp: { visits: number; required: number; rewardReady: boolean };
}

export interface NextBestOffer {
  id: string;
  customerId: string;
  kind: OfferKind;
  /** Flat discount in paise when kind is discount_paise */
  discountPaise: number;
  /** Extra points when kind is points_bonus */
  pointsBonus: number;
  title: string;
  reason: string;
  source: "heuristic";
}

/**
 * Exactly one offer per enrolled customer.
 * Priority: quiet high-spender → stamp-close → frequent → near-tier → welcome.
 */
export function generateNextBestOffer(
  customer: OfferCustomerInput
): NextBestOffer {
  const days = customer.daysSinceLastPurchase;
  const avgTicket =
    customer.visitCount > 0
      ? Math.round(customer.lifetimeSpendPaise / customer.visitCount)
      : 0;

  // Quiet high spender: win-back discount (~5% of avg ticket, ₹20–₹100)
  if (
    customer.lifetimeSpendPaise >= 5_000_00 &&
    days != null &&
    days >= 21
  ) {
    const discount = Math.min(
      10_000,
      Math.max(2_000, Math.round(avgTicket * 0.05))
    );
    return {
      id: `offer_winback_${customer.id}`,
      customerId: customer.id,
      kind: "discount_paise",
      discountPaise: discount,
      pointsBonus: 0,
      title: `Win-back ₹${(discount / 100).toFixed(0)} off`,
      reason: `Last visit ${days}d ago; lifetime ₹${Math.round(customer.lifetimeSpendPaise / 100)} — gap-based win-back.`,
      source: "heuristic",
    };
  }

  // One stamp away → points bonus to nudge the visit
  if (
    customer.stamp.required > 0 &&
    customer.stamp.required - customer.stamp.visits === 1 &&
    customer.stamp.visits > 0
  ) {
    const bonus = Math.max(20, Math.min(100, Math.round(avgTicket / 100) || 25));
    return {
      id: `offer_stamp_${customer.id}`,
      customerId: customer.id,
      kind: "points_bonus",
      discountPaise: 0,
      pointsBonus: bonus,
      title: `+${bonus} points this visit`,
      reason: `Stamp ${customer.stamp.visits}/${customer.stamp.required} — bonus points to close the card.`,
      source: "heuristic",
    };
  }

  // Frequent recent buyer → thank-you points
  if (customer.visitCount >= 5 && (days ?? 999) <= 14) {
    const bonus = Math.min(50, 10 + customer.visitCount);
    return {
      id: `offer_freq_${customer.id}`,
      customerId: customer.id,
      kind: "points_bonus",
      discountPaise: 0,
      pointsBonus: bonus,
      title: `+${bonus} thank-you points`,
      reason: `${customer.visitCount} visits RFM frequency — reward loyalty.`,
      source: "heuristic",
    };
  }

  // Near next tier → small discount toward threshold
  if (customer.tier === "bronze" || customer.tier === "silver") {
    const next =
      customer.tier === "bronze" ? 50_000_00 : 200_000_00;
    const remaining = next - customer.lifetimeSpendPaise;
    if (remaining > 0 && remaining <= next * 0.15) {
      const discount = Math.min(5_000, Math.max(1_000, Math.round(remaining * 0.02)));
      return {
        id: `offer_tier_${customer.id}`,
        customerId: customer.id,
        kind: "discount_paise",
        discountPaise: discount,
        pointsBonus: 0,
        title: `₹${(discount / 100).toFixed(0)} toward ${customer.tier === "bronze" ? "silver" : "gold"}`,
        reason: `₹${(remaining / 100).toFixed(0)} left to next tier — small push discount.`,
        source: "heuristic",
      };
    }
  }

  // New / light customers — welcome points
  if (customer.visitCount <= 2) {
    return {
      id: `offer_welcome_${customer.id}`,
      customerId: customer.id,
      kind: "points_bonus",
      discountPaise: 0,
      pointsBonus: 25,
      title: "+25 welcome points",
      reason: "New or light RFM — welcome bonus to encourage a return.",
      source: "heuristic",
    };
  }

  // Default: modest points bonus from monetary RFM
  const bonus = Math.min(
    40,
    Math.max(10, Math.floor(customer.lifetimeSpendPaise / 100_00))
  );
  return {
    id: `offer_default_${customer.id}`,
    customerId: customer.id,
    kind: "points_bonus",
    discountPaise: 0,
    pointsBonus: bonus,
    title: `+${bonus} points bonus`,
    reason: "Default RFM offer from lifetime spend band.",
    source: "heuristic",
  };
}
