import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateNextBestOffer } from "../src/lib/loyalty-offers.js";

const base = {
  id: "lc_1",
  points: 50,
  lifetimeSpendPaise: 0,
  visitCount: 0,
  daysSinceLastPurchase: null as number | null,
  tier: "none",
  stamp: { visits: 0, required: 10, rewardReady: false },
};

describe("loyalty next-best offer", () => {
  it("offers welcome points for new customers", () => {
    const o = generateNextBestOffer({ ...base, visitCount: 1 });
    assert.equal(o.kind, "points_bonus");
    assert.equal(o.pointsBonus, 25);
    assert.ok(o.id.includes("welcome"));
  });

  it("offers win-back discount for quiet high spenders", () => {
    const o = generateNextBestOffer({
      ...base,
      lifetimeSpendPaise: 20_000_00,
      visitCount: 8,
      daysSinceLastPurchase: 30,
      tier: "bronze",
      stamp: { visits: 3, required: 10, rewardReady: false },
    });
    assert.equal(o.kind, "discount_paise");
    assert.ok(o.discountPaise >= 2000);
    assert.ok(o.reason.includes("gap"));
  });

  it("offers stamp-close points bonus", () => {
    const o = generateNextBestOffer({
      ...base,
      lifetimeSpendPaise: 8_000_00,
      visitCount: 9,
      daysSinceLastPurchase: 3,
      tier: "bronze",
      stamp: { visits: 9, required: 10, rewardReady: false },
    });
    assert.equal(o.kind, "points_bonus");
    assert.ok(o.id.includes("stamp"));
    assert.ok(o.pointsBonus > 0);
  });

  it("returns exactly one offer object", () => {
    const o = generateNextBestOffer({
      ...base,
      lifetimeSpendPaise: 100_000_00,
      visitCount: 12,
      daysSinceLastPurchase: 2,
      tier: "silver",
      stamp: { visits: 2, required: 10, rewardReady: false },
    });
    assert.equal(o.customerId, "lc_1");
    assert.equal(o.source, "heuristic");
    assert.ok(o.kind === "discount_paise" || o.kind === "points_bonus");
  });
});
