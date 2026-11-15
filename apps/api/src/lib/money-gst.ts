/** GST math helpers — amounts in integer paise, rates in percent (e.g. 18). */

export type GstSplitMode = "cgst_sgst" | "igst";
export type GstPriceMode = "inclusive" | "exclusive";

export interface GstBreakdown {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalTaxPaise: number;
  grossPaise: number;
  ratePercent: number;
  splitMode: GstSplitMode;
  priceMode: GstPriceMode;
}

export function computeGst(opts: {
  amountPaise: number;
  ratePercent: number;
  splitMode: GstSplitMode;
  priceMode: GstPriceMode;
}): GstBreakdown {
  const rate = Math.max(0, opts.ratePercent);
  const amount = Math.max(0, Math.trunc(opts.amountPaise));

  let taxablePaise: number;
  let totalTaxPaise: number;
  let grossPaise: number;

  if (opts.priceMode === "inclusive") {
    // taxable = amount / (1 + rate/100)
    taxablePaise = rate === 0 ? amount : Math.round(amount / (1 + rate / 100));
    totalTaxPaise = amount - taxablePaise;
    grossPaise = amount;
  } else {
    taxablePaise = amount;
    totalTaxPaise = Math.round((amount * rate) / 100);
    grossPaise = amount + totalTaxPaise;
  }

  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;

  if (opts.splitMode === "igst") {
    igstPaise = totalTaxPaise;
  } else {
    cgstPaise = Math.floor(totalTaxPaise / 2);
    sgstPaise = totalTaxPaise - cgstPaise;
  }

  return {
    taxablePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    totalTaxPaise,
    grossPaise,
    ratePercent: rate,
    splitMode: opts.splitMode,
    priceMode: opts.priceMode,
  };
}

/** India financial year: Apr (month 4) → Mar. `fyStartMonth` is 1–12 (default 4). */
export function financialYearBounds(
  ref: Date = new Date(),
  fyStartMonth = 4
): { from: Date; to: Date; label: string } {
  const startMonth = Math.min(12, Math.max(1, fyStartMonth));
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth() + 1; // 1–12
  const fyStartYear = m >= startMonth ? y : y - 1;
  const from = new Date(Date.UTC(fyStartYear, startMonth - 1, 1, 0, 0, 0));
  const toYear = startMonth === 1 ? fyStartYear : fyStartYear + 1;
  const toMonth = startMonth === 1 ? 12 : startMonth - 1;
  const lastDay = new Date(Date.UTC(toYear, toMonth, 0)).getUTCDate();
  const to = new Date(Date.UTC(toYear, toMonth - 1, lastDay, 23, 59, 59, 999));
  const label =
    startMonth === 4
      ? `FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`
      : `FY ${fyStartYear}`;
  return { from, to, label };
}

export function dayBounds(isoDate: string): { from: string; to: string } {
  const d = isoDate.slice(0, 10);
  return { from: `${d}T00:00:00.000Z`, to: `${d}T23:59:59.999Z` };
}

export function monthBounds(year: number, month1to12: number): { from: string; to: string } {
  const from = new Date(Date.UTC(year, month1to12 - 1, 1, 0, 0, 0));
  const to = new Date(Date.UTC(year, month1to12, 0, 23, 59, 59, 999));
  return { from: from.toISOString(), to: to.toISOString() };
}
