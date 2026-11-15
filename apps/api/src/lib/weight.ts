/** Loose / weight sale helpers. Stock is always stored in base units. */

export type WeightUnit = "kg" | "g" | "L" | "ml";
export type SaleMode = "unit" | "weight";

/** Base unit for inventory qty storage. */
export function baseUnit(unit: WeightUnit): "g" | "ml" {
  if (unit === "kg" || unit === "g") return "g";
  return "ml";
}

/** How many base units in one display unit (kg→1000g, L→1000ml, g/ml→1). */
export function basePerDisplay(unit: WeightUnit): number {
  if (unit === "kg" || unit === "L") return 1000;
  return 1;
}

export function toBaseQty(qtyDisplay: number, unit: WeightUnit): number {
  if (!Number.isFinite(qtyDisplay) || qtyDisplay < 0) {
    throw new Error("weight qty must be a non-negative number");
  }
  return qtyDisplay * basePerDisplay(unit);
}

export function fromBaseQty(qtyBase: number, unit: WeightUnit): number {
  return qtyBase / basePerDisplay(unit);
}

/**
 * Amount for a weight sale.
 * `pricePerDisplayPaise` is the rate shown on shelf (e.g. ₹80/kg).
 * `weightDisplay` is the weighed amount in the same display unit (e.g. 0.250 kg).
 */
export function computeWeightSaleAmount(opts: {
  weightDisplay: number;
  pricePerDisplayPaise: number;
}): { amountPaise: number; weightDisplay: number; pricePerDisplayPaise: number } {
  const w = Number(opts.weightDisplay);
  const rate = Math.trunc(Number(opts.pricePerDisplayPaise));
  if (!Number.isFinite(w) || w <= 0) throw new Error("weight must be positive");
  if (!Number.isFinite(rate) || rate < 0) throw new Error("price must be non-negative");
  return {
    weightDisplay: w,
    pricePerDisplayPaise: rate,
    amountPaise: Math.round(w * rate),
  };
}

/**
 * Profit for a weight sale using bulk cost expressed in the same display unit
 * as the retail rate (e.g. bulk 10 kg cost ₹500 → cost/kg = ₹50).
 */
export function computeWeightProfit(opts: {
  weightDisplay: number;
  pricePerDisplayPaise: number;
  bulkQtyDisplay: number;
  bulkCostPaise: number;
}): {
  amountPaise: number;
  costPaise: number;
  profitPaise: number;
  costPerDisplayPaiseExact: number;
  profitPerDisplayPaiseExact: number;
} {
  const sale = computeWeightSaleAmount(opts);
  const bulkQty = Number(opts.bulkQtyDisplay);
  const bulkCost = Math.trunc(Number(opts.bulkCostPaise));
  if (!Number.isFinite(bulkQty) || bulkQty <= 0) {
    throw new Error("bulkQtyDisplay must be positive");
  }
  if (!Number.isFinite(bulkCost) || bulkCost < 0) {
    throw new Error("bulkCostPaise must be non-negative");
  }
  const costPerDisplayPaiseExact = bulkCost / bulkQty;
  const costPaise = Math.round(costPerDisplayPaiseExact * opts.weightDisplay);
  const profitPaise = sale.amountPaise - costPaise;
  return {
    amountPaise: sale.amountPaise,
    costPaise,
    profitPaise,
    costPerDisplayPaiseExact,
    profitPerDisplayPaiseExact: sale.pricePerDisplayPaise - costPerDisplayPaiseExact,
  };
}

export function formatWeightLabel(weightDisplay: number, unit: WeightUnit): string {
  const n =
    weightDisplay >= 10
      ? weightDisplay.toFixed(2)
      : weightDisplay >= 1
        ? weightDisplay.toFixed(3)
        : weightDisplay.toFixed(3);
  return `${n.replace(/\.?0+$/, "") || "0"} ${unit}`;
}
