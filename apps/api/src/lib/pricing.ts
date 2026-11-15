/** Bulk vs retail pricing helpers — all money in integer paise. */

export interface BulkRetailInput {
  bulkQty: number;
  bulkCostPaise: number;
  unitPricePaise: number;
}

export interface PricingBreakdown {
  bulkQty: number;
  bulkCostPaise: number;
  unitPricePaise: number;
  /** Floor to nearest paise for display stability; also expose float for math. */
  costPerUnitPaise: number;
  costPerUnitPaiseExact: number;
  profitPerUnitPaise: number;
  profitPerUnitPaiseExact: number;
}

export interface ProjectedProfit {
  sellQty: number;
  profitPaise: number;
  profitPaiseExact: number;
  revenuePaise: number;
  costPaise: number;
}

export function computeUnitPricing(input: BulkRetailInput): PricingBreakdown {
  const bulkQty = Number(input.bulkQty);
  const bulkCostPaise = Math.trunc(Number(input.bulkCostPaise));
  const unitPricePaise = Math.trunc(Number(input.unitPricePaise));

  if (!Number.isFinite(bulkQty) || bulkQty <= 0) {
    throw new Error("bulkQty must be a positive number");
  }
  if (!Number.isFinite(bulkCostPaise) || bulkCostPaise < 0) {
    throw new Error("bulkCostPaise must be a non-negative integer");
  }
  if (!Number.isFinite(unitPricePaise) || unitPricePaise < 0) {
    throw new Error("unitPricePaise must be a non-negative integer");
  }

  const costPerUnitPaiseExact = bulkCostPaise / bulkQty;
  const profitPerUnitPaiseExact = unitPricePaise - costPerUnitPaiseExact;

  return {
    bulkQty,
    bulkCostPaise,
    unitPricePaise,
    costPerUnitPaise: Math.round(costPerUnitPaiseExact),
    costPerUnitPaiseExact,
    profitPerUnitPaise: Math.round(profitPerUnitPaiseExact),
    profitPerUnitPaiseExact,
  };
}

export function projectProfit(
  input: BulkRetailInput,
  sellQty: number
): ProjectedProfit {
  const pricing = computeUnitPricing(input);
  const n = Number(sellQty);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("sellQty must be a non-negative number");
  }
  const profitPaiseExact = pricing.profitPerUnitPaiseExact * n;
  const revenuePaise = Math.round(pricing.unitPricePaise * n);
  const costPaise = Math.round(pricing.costPerUnitPaiseExact * n);
  return {
    sellQty: n,
    profitPaise: Math.round(profitPaiseExact),
    profitPaiseExact,
    revenuePaise,
    costPaise,
  };
}

/**
 * User example: 1000 biscuits cost ₹3500 → ₹3.50/unit; sell @ ₹4 → ₹0.50 profit/unit;
 * sell 100 → ₹50 profit.
 */
export const PRICING_EXAMPLE = {
  bulkQty: 1000,
  bulkCostPaise: 350_000,
  unitPricePaise: 400,
  sellQty: 100,
  expectedCostPerUnitPaise: 350,
  expectedProfitPerUnitPaise: 50,
  expectedProfitFor100Paise: 5000,
} as const;
