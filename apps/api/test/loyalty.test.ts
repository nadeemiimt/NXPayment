import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { resetDbForTests } from "../src/db/schema.js";
import {
  applyRedeem,
  earnPoints,
  tierFromLifetimeSpend,
} from "../src/lib/loyalty-math.js";
import {
  enrollCustomer,
  getLoyaltyRules,
  recordPurchase,
  updateLoyaltyRules,
} from "../src/services/loyalty.js";

describe("loyalty points math", () => {
  it("earns 1 point per rupee by default", () => {
    assert.equal(earnPoints(12_500, { ...getDefault(), pointsPerRupee: 1 }), 125);
  });

  it("redeems points into discount without going negative", () => {
    const rules = { ...getDefault(), paisePerPointRedeem: 100 };
    const r = applyRedeem({
      amountPaise: 5000,
      pointsToRedeem: 100,
      availablePoints: 80,
      rules,
    });
    assert.equal(r.pointsRedeemed, 50); // ₹50 bill caps at 50 points
    assert.equal(r.discountPaise, 5000);
    assert.equal(r.payablePaise, 0);
  });

  it("assigns tiers from lifetime spend", () => {
    const rules = getDefault();
    assert.equal(tierFromLifetimeSpend(0, rules), "none");
    assert.equal(tierFromLifetimeSpend(100, rules), "bronze");
    assert.equal(tierFromLifetimeSpend(rules.silverThresholdPaise, rules), "silver");
    assert.equal(tierFromLifetimeSpend(rules.goldThresholdPaise, rules), "gold");
  });
});

function getDefault() {
  return {
    pointsPerRupee: 1,
    paisePerPointRedeem: 100,
    silverThresholdPaise: 5_000_000,
    goldThresholdPaise: 20_000_000,
    stampVisitsRequired: 10,
    stampRewardPaise: 5000,
  };
}

describe("loyalty purchase flow", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nxp-loy-"));
  before(() => resetDbForTests(path.join(tmp, "l.sqlite")));
  after(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("enrolls, earns, and redeems", () => {
    updateLoyaltyRules({ pointsPerRupee: 1, paisePerPointRedeem: 100 });
    const c = enrollCustomer({ phone: "9876543210", name: "Asha" });
    assert.equal(c.points, 0);

    const first = recordPurchase({
      customerId: c.id,
      amountPaise: 10_000, // ₹100 → 100 points
    });
    assert.equal(first.earned, 100);
    assert.equal(first.customer.points, 100);
    assert.equal(first.customer.visitCount, 1);

    const second = recordPurchase({
      customerId: c.id,
      amountPaise: 5000,
      pointsToRedeem: 20, // ₹20 off
    });
    assert.equal(second.redeemed, 20);
    assert.equal(second.discountPaise, 2000);
    assert.equal(second.payablePaise, 3000);
    // earned on payable 3000 → 30; points = 100-20+30 = 110
    assert.equal(second.customer.points, 110);
    assert.ok(getLoyaltyRules().pointsPerRupee === 1);
  });
});
