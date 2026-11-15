import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRICING_EXAMPLE,
  computeUnitPricing,
  projectProfit,
} from "../src/lib/pricing.js";

describe("bulk vs retail profit math", () => {
  it("matches the biscuit example: ₹3.50 cost, ₹4 sell, ₹50 on 100", () => {
    const pricing = computeUnitPricing({
      bulkQty: PRICING_EXAMPLE.bulkQty,
      bulkCostPaise: PRICING_EXAMPLE.bulkCostPaise,
      unitPricePaise: PRICING_EXAMPLE.unitPricePaise,
    });
    assert.equal(pricing.costPerUnitPaise, PRICING_EXAMPLE.expectedCostPerUnitPaise);
    assert.equal(pricing.profitPerUnitPaise, PRICING_EXAMPLE.expectedProfitPerUnitPaise);
    assert.equal(pricing.costPerUnitPaiseExact, 350);
    assert.equal(pricing.profitPerUnitPaiseExact, 50);

    const projected = projectProfit(
      {
        bulkQty: PRICING_EXAMPLE.bulkQty,
        bulkCostPaise: PRICING_EXAMPLE.bulkCostPaise,
        unitPricePaise: PRICING_EXAMPLE.unitPricePaise,
      },
      PRICING_EXAMPLE.sellQty
    );
    assert.equal(projected.profitPaise, PRICING_EXAMPLE.expectedProfitFor100Paise);
    assert.equal(projected.revenuePaise, 40_000);
    assert.equal(projected.costPaise, 35_000);
  });

  it("handles fractional cost per unit without inventing profit", () => {
    // 3 units for ₹10 → 333.333… paise cost; sell @ ₹5 (500) → profit ~166.67
    const pricing = computeUnitPricing({
      bulkQty: 3,
      bulkCostPaise: 1000,
      unitPricePaise: 500,
    });
    assert.ok(Math.abs(pricing.costPerUnitPaiseExact - 1000 / 3) < 1e-9);
    assert.equal(pricing.costPerUnitPaise, 333);
    const proj = projectProfit(
      { bulkQty: 3, bulkCostPaise: 1000, unitPricePaise: 500 },
      3
    );
    assert.equal(proj.profitPaise, 500); // 1500 revenue − 1000 cost
  });

  it("rejects invalid bulk qty", () => {
    assert.throws(() =>
      computeUnitPricing({ bulkQty: 0, bulkCostPaise: 100, unitPricePaise: 10 })
    );
  });
});
