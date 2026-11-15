import { nanoid } from "nanoid";
import { getDb } from "../db/schema.js";
import {
  DEFAULT_LOYALTY_RULES,
  applyRedeem,
  earnPoints,
  stampProgress,
  tierFromLifetimeSpend,
  type LoyaltyRules,
  type LoyaltyTier,
} from "../lib/loyalty-math.js";

export interface LoyaltyRulesDto extends LoyaltyRules {
  updatedAt: string;
}

export interface LoyaltyCustomerDto {
  id: string;
  phone: string;
  name: string | null;
  points: number;
  lifetimeSpendPaise: number;
  visitCount: number;
  lastPurchaseAt: string | null;
  tier: LoyaltyTier;
  stamp: { visits: number; required: number; rewardReady: boolean };
  daysSinceLastPurchase: number | null;
  createdAt: string;
  updatedAt: string;
}

interface CustomerRow {
  id: string;
  phone: string;
  name: string | null;
  points: number;
  lifetime_spend_paise: number;
  visit_count: number;
  last_purchase_at: string | null;
  tier: string;
  created_at: string;
  updated_at: string;
}

function rulesFromRow(row: {
  points_per_rupee: number;
  paise_per_point_redeem: number;
  silver_threshold_paise: number;
  gold_threshold_paise: number;
  stamp_visits_required: number;
  stamp_reward_paise: number;
  updated_at: string;
}): LoyaltyRulesDto {
  return {
    pointsPerRupee: row.points_per_rupee,
    paisePerPointRedeem: row.paise_per_point_redeem,
    silverThresholdPaise: row.silver_threshold_paise,
    goldThresholdPaise: row.gold_threshold_paise,
    stampVisitsRequired: row.stamp_visits_required,
    stampRewardPaise: row.stamp_reward_paise,
    updatedAt: row.updated_at,
  };
}

export function getLoyaltyRules(): LoyaltyRulesDto {
  const row = getDb().prepare("SELECT * FROM loyalty_rules WHERE id = 1").get() as
    | Parameters<typeof rulesFromRow>[0]
    | undefined;
  if (!row) {
    return { ...DEFAULT_LOYALTY_RULES, updatedAt: new Date().toISOString() };
  }
  return rulesFromRow(row);
}

export function updateLoyaltyRules(
  input: Partial<LoyaltyRules>
): LoyaltyRulesDto {
  const current = getLoyaltyRules();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE loyalty_rules SET
        points_per_rupee = ?, paise_per_point_redeem = ?,
        silver_threshold_paise = ?, gold_threshold_paise = ?,
        stamp_visits_required = ?, stamp_reward_paise = ?, updated_at = ?
       WHERE id = 1`
    )
    .run(
      input.pointsPerRupee ?? current.pointsPerRupee,
      input.paisePerPointRedeem ?? current.paisePerPointRedeem,
      input.silverThresholdPaise ?? current.silverThresholdPaise,
      input.goldThresholdPaise ?? current.goldThresholdPaise,
      input.stampVisitsRequired ?? current.stampVisitsRequired,
      input.stampRewardPaise ?? current.stampRewardPaise,
      now
    );
  return getLoyaltyRules();
}

function toCustomer(row: CustomerRow): LoyaltyCustomerDto {
  const rules = getLoyaltyRules();
  const last = row.last_purchase_at;
  const daysSinceLastPurchase = last
    ? Math.floor((Date.now() - new Date(last).getTime()) / (24 * 60 * 60 * 1000))
    : null;
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    points: row.points,
    lifetimeSpendPaise: row.lifetime_spend_paise,
    visitCount: row.visit_count,
    lastPurchaseAt: row.last_purchase_at,
    tier: (row.tier as LoyaltyTier) || "none",
    stamp: stampProgress(row.visit_count, rules),
    daysSinceLastPurchase,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listCustomers(opts?: {
  q?: string;
  limit?: number;
}): LoyaltyCustomerDto[] {
  const limit = opts?.limit ?? 100;
  const q = opts?.q?.trim();
  let rows: CustomerRow[];
  if (q) {
    rows = getDb()
      .prepare(
        `SELECT * FROM loyalty_customers
         WHERE deleted_at IS NULL AND (phone LIKE ? OR IFNULL(name,'') LIKE ?)
         ORDER BY CASE WHEN last_purchase_at IS NULL THEN 1 ELSE 0 END,
                  last_purchase_at DESC, created_at DESC
         LIMIT ?`
      )
      .all(`%${q}%`, `%${q}%`, limit) as CustomerRow[];
  } else {
    rows = getDb()
      .prepare(
        `SELECT * FROM loyalty_customers WHERE deleted_at IS NULL
         ORDER BY CASE WHEN last_purchase_at IS NULL THEN 1 ELSE 0 END,
                  last_purchase_at DESC, created_at DESC LIMIT ?`
      )
      .all(limit) as CustomerRow[];
  }
  return rows.map(toCustomer);
}

export function getCustomer(id: string): LoyaltyCustomerDto | null {
  const row = getDb()
    .prepare(`SELECT * FROM loyalty_customers WHERE id = ? AND deleted_at IS NULL`)
    .get(id) as CustomerRow | undefined;
  return row ? toCustomer(row) : null;
}

export function findCustomerByPhone(phone: string): LoyaltyCustomerDto | null {
  const normalized = phone.replace(/\s+/g, "").trim();
  const row = getDb()
    .prepare(
      `SELECT * FROM loyalty_customers WHERE phone = ? AND deleted_at IS NULL`
    )
    .get(normalized) as CustomerRow | undefined;
  return row ? toCustomer(row) : null;
}

export function enrollCustomer(input: {
  phone: string;
  name?: string | null;
}): LoyaltyCustomerDto {
  const phone = input.phone.replace(/\s+/g, "").trim();
  if (!/^\+?\d{8,15}$/.test(phone)) throw new Error("Invalid phone");
  const existing = findCustomerByPhone(phone);
  if (existing) {
    if (input.name && input.name !== existing.name) {
      const now = new Date().toISOString();
      getDb()
        .prepare(
          `UPDATE loyalty_customers SET name = ?, updated_at = ? WHERE id = ?`
        )
        .run(input.name, now, existing.id);
      return getCustomer(existing.id)!;
    }
    return existing;
  }
  const id = `lc_${nanoid(10)}`;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO loyalty_customers (
        id, phone, name, points, lifetime_spend_paise, visit_count,
        last_purchase_at, tier, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, 0, 0, 0, NULL, 'none', ?, ?, NULL)`
    )
    .run(id, phone, input.name ?? null, now, now);
  return getCustomer(id)!;
}

function ledger(
  customerId: string,
  kind: string,
  pointsDelta: number,
  opts?: { paymentId?: string; amountPaise?: number; note?: string }
) {
  getDb()
    .prepare(
      `INSERT INTO loyalty_ledger (id, customer_id, payment_id, kind, points_delta, amount_paise, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      `ll_${nanoid(10)}`,
      customerId,
      opts?.paymentId ?? null,
      kind,
      pointsDelta,
      opts?.amountPaise ?? null,
      opts?.note ?? null,
      new Date().toISOString()
    );
}

export function recordPurchase(opts: {
  customerId: string;
  amountPaise: number;
  paymentId?: string;
  pointsToRedeem?: number;
}): {
  customer: LoyaltyCustomerDto;
  earned: number;
  redeemed: number;
  discountPaise: number;
  payablePaise: number;
  stampRewardPaise: number;
} {
  const customer = getCustomer(opts.customerId);
  if (!customer) throw new Error("Customer not found");
  const rules = getLoyaltyRules();

  const redeem = applyRedeem({
    amountPaise: opts.amountPaise,
    pointsToRedeem: opts.pointsToRedeem ?? 0,
    availablePoints: customer.points,
    rules,
  });

  const earned = earnPoints(redeem.payablePaise, rules);
  const nextVisits = customer.visitCount + 1;
  const stamp = stampProgress(nextVisits, rules);
  let stampRewardPaise = 0;
  if (stamp.rewardReady && rules.stampRewardPaise > 0) {
    stampRewardPaise = rules.stampRewardPaise;
  }

  const lifetime = customer.lifetimeSpendPaise + redeem.payablePaise;
  const tier = tierFromLifetimeSpend(lifetime, rules);
  const points = redeem.pointsRemaining + earned;
  const now = new Date().toISOString();

  getDb()
    .prepare(
      `UPDATE loyalty_customers SET
        points = ?, lifetime_spend_paise = ?, visit_count = ?,
        last_purchase_at = ?, tier = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(points, lifetime, nextVisits, now, tier, now, opts.customerId);

  if (redeem.pointsRedeemed > 0) {
    ledger(opts.customerId, "redeem", -redeem.pointsRedeemed, {
      paymentId: opts.paymentId,
      amountPaise: redeem.discountPaise,
      note: "points redeemed",
    });
  }
  if (earned > 0) {
    ledger(opts.customerId, "earn", earned, {
      paymentId: opts.paymentId,
      amountPaise: redeem.payablePaise,
      note: "points earned",
    });
  }
  if (stampRewardPaise > 0) {
    ledger(opts.customerId, "stamp_reward", 0, {
      paymentId: opts.paymentId,
      amountPaise: stampRewardPaise,
      note: "stamp visit reward",
    });
  }

  return {
    customer: getCustomer(opts.customerId)!,
    earned,
    redeemed: redeem.pointsRedeemed,
    discountPaise: redeem.discountPaise + stampRewardPaise,
    payablePaise: Math.max(0, redeem.payablePaise - stampRewardPaise),
    stampRewardPaise,
  };
}

export interface LoyaltyNudge {
  id: string;
  kind: "quiet_high_spender" | "frequent_buyer" | "near_tier" | "stamp_close";
  title: string;
  reason: string;
  customerId: string;
  phone: string;
  encourageAction: {
    type: "note" | "whatsapp_stub";
    message: string;
  };
}

export function loyaltyNudges(): LoyaltyNudge[] {
  const rules = getLoyaltyRules();
  const customers = listCustomers({ limit: 200 });
  const out: LoyaltyNudge[] = [];

  for (const c of customers) {
    if (
      c.lifetimeSpendPaise >= rules.silverThresholdPaise / 2 &&
      c.daysSinceLastPurchase != null &&
      c.daysSinceLastPurchase >= 21
    ) {
      out.push({
        id: `nudge_quiet_${c.id}`,
        kind: "quiet_high_spender",
        title: `${c.name || c.phone} has gone quiet`,
        reason: `Spent ${Math.round(c.lifetimeSpendPaise / 100)} lifetime; last visit ${c.daysSinceLastPurchase}d ago.`,
        customerId: c.id,
        phone: c.phone,
        encourageAction: {
          type: "whatsapp_stub",
          message: `Hi${c.name ? ` ${c.name}` : ""} — we miss you at the shop. Your ${c.tier} rewards are waiting.`,
        },
      });
    }
    if (c.visitCount >= 5 && (c.daysSinceLastPurchase ?? 0) <= 14) {
      out.push({
        id: `nudge_freq_${c.id}`,
        kind: "frequent_buyer",
        title: `Thank ${c.name || c.phone}`,
        reason: `${c.visitCount} visits — frequent buyer.`,
        customerId: c.id,
        phone: c.phone,
        encourageAction: {
          type: "note",
          message: "Offer a small thank-you discount next visit.",
        },
      });
    }
    if (c.tier === "bronze" || c.tier === "silver") {
      const next =
        c.tier === "bronze" ? rules.silverThresholdPaise : rules.goldThresholdPaise;
      const remaining = next - c.lifetimeSpendPaise;
      if (remaining > 0 && remaining <= next * 0.15) {
        out.push({
          id: `nudge_tier_${c.id}`,
          kind: "near_tier",
          title: `${c.name || c.phone} near next tier`,
          reason: `₹${(remaining / 100).toFixed(0)} more to ${c.tier === "bronze" ? "silver" : "gold"}.`,
          customerId: c.id,
          phone: c.phone,
          encourageAction: {
            type: "whatsapp_stub",
            message: `You're close to the next loyalty tier — a few more purchases unlock it.`,
          },
        });
      }
    }
    if (
      rules.stampVisitsRequired > 0 &&
      c.stamp.required - c.stamp.visits === 1 &&
      c.stamp.visits > 0
    ) {
      out.push({
        id: `nudge_stamp_${c.id}`,
        kind: "stamp_close",
        title: `${c.name || c.phone} one stamp away`,
        reason: `${c.stamp.visits}/${c.stamp.required} visits toward stamp reward.`,
        customerId: c.id,
        phone: c.phone,
        encourageAction: {
          type: "note",
          message: "Remind them one more visit unlocks the stamp reward.",
        },
      });
    }
  }

  return out.slice(0, 20);
}
