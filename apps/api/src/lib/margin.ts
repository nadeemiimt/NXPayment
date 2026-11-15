/** Margin / loss guard — amounts in paise, margin as percent of cost. */

export type MarginAction = "allow" | "warn" | "block";

export interface MarginCheckInput {
  sellPaise: number;
  costPaise: number;
  /** Minimum profit as % of cost. E.g. 10 = must be ≥10% above cost. */
  minMarginPercent: number;
  /** When below min margin: warn (allow with flag) or block. Below cost always blocks if enforceBelowCost. */
  underMarginMode: "warn" | "block";
  enforceBelowCost?: boolean;
}

export interface MarginCheckResult {
  action: MarginAction;
  sellPaise: number;
  costPaise: number;
  profitPaise: number;
  marginPercent: number | null;
  belowCost: boolean;
  underMinMargin: boolean;
  message: string | null;
}

export function checkMargin(input: MarginCheckInput): MarginCheckResult {
  const sell = Math.trunc(input.sellPaise);
  const cost = Math.trunc(input.costPaise);
  const profit = sell - cost;
  const belowCost = sell < cost;
  const marginPercent =
    cost > 0 ? (profit / cost) * 100 : sell > 0 ? 100 : null;
  const min = Math.max(0, input.minMarginPercent);
  const underMinMargin =
    cost > 0 ? (marginPercent ?? 0) < min : false;

  const enforceBelowCost = input.enforceBelowCost !== false;

  if (belowCost && enforceBelowCost) {
    return {
      action: "block",
      sellPaise: sell,
      costPaise: cost,
      profitPaise: profit,
      marginPercent,
      belowCost: true,
      underMinMargin,
      message: `Sell ${sell} paise is below cost ${cost} paise — loss of ${-profit} paise`,
    };
  }

  if (underMinMargin) {
    const msg = `Margin ${marginPercent!.toFixed(1)}% is under shop minimum ${min}%`;
    if (input.underMarginMode === "block") {
      return {
        action: "block",
        sellPaise: sell,
        costPaise: cost,
        profitPaise: profit,
        marginPercent,
        belowCost,
        underMinMargin: true,
        message: msg,
      };
    }
    return {
      action: "warn",
      sellPaise: sell,
      costPaise: cost,
      profitPaise: profit,
      marginPercent,
      belowCost,
      underMinMargin: true,
      message: msg,
    };
  }

  return {
    action: "allow",
    sellPaise: sell,
    costPaise: cost,
    profitPaise: profit,
    marginPercent,
    belowCost: false,
    underMinMargin: false,
    message: null,
  };
}

/** Days until expiry from ISO date (YYYY-MM-DD or full ISO). */
export function daysUntilExpiry(expiryDate: string, now = new Date()): number | null {
  const d = new Date(expiryDate.length <= 10 ? `${expiryDate}T00:00:00Z` : expiryDate);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}
