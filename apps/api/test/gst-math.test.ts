import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeGst,
  dayBounds,
  financialYearBounds,
  monthBounds,
} from "../src/lib/money-gst.js";

describe("GST math", () => {
  it("splits inclusive 18% CGST/SGST on ₹118", () => {
    // 11800 paise inclusive @ 18% → taxable 10000, tax 1800
    const b = computeGst({
      amountPaise: 11800,
      ratePercent: 18,
      splitMode: "cgst_sgst",
      priceMode: "inclusive",
    });
    assert.equal(b.taxablePaise, 10000);
    assert.equal(b.totalTaxPaise, 1800);
    assert.equal(b.cgstPaise + b.sgstPaise, 1800);
    assert.equal(b.igstPaise, 0);
    assert.equal(b.grossPaise, 11800);
  });

  it("adds exclusive IGST on ₹100", () => {
    const b = computeGst({
      amountPaise: 10000,
      ratePercent: 18,
      splitMode: "igst",
      priceMode: "exclusive",
    });
    assert.equal(b.taxablePaise, 10000);
    assert.equal(b.igstPaise, 1800);
    assert.equal(b.cgstPaise, 0);
    assert.equal(b.grossPaise, 11800);
  });

  it("handles zero rate", () => {
    const b = computeGst({
      amountPaise: 5000,
      ratePercent: 0,
      splitMode: "cgst_sgst",
      priceMode: "inclusive",
    });
    assert.equal(b.taxablePaise, 5000);
    assert.equal(b.totalTaxPaise, 0);
  });
});

describe("period windows", () => {
  it("day bounds are UTC midnights", () => {
    const b = dayBounds("2026-11-15");
    assert.equal(b.from, "2026-11-15T00:00:00.000Z");
    assert.equal(b.to, "2026-11-15T23:59:59.999Z");
  });

  it("month bounds cover full calendar month", () => {
    const b = monthBounds(2026, 2);
    assert.equal(b.from, "2026-02-01T00:00:00.000Z");
    assert.ok(b.to.startsWith("2026-02-28"));
  });

  it("India FY Apr–Mar for a May date", () => {
    const fy = financialYearBounds(new Date("2026-05-10T12:00:00Z"), 4);
    assert.equal(fy.from.toISOString(), "2026-04-01T00:00:00.000Z");
    assert.equal(fy.label, "FY 2026-27");
    assert.ok(fy.to.toISOString().startsWith("2027-03-31"));
  });

  it("India FY rolls back before April", () => {
    const fy = financialYearBounds(new Date("2026-02-01T00:00:00Z"), 4);
    assert.equal(fy.from.toISOString(), "2025-04-01T00:00:00.000Z");
    assert.equal(fy.label, "FY 2025-26");
  });
});
