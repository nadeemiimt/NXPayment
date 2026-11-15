import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkMargin, daysUntilExpiry } from "../src/lib/margin.js";

describe("margin guard", () => {
  it("blocks sell below cost", () => {
    const r = checkMargin({
      sellPaise: 900,
      costPaise: 1000,
      minMarginPercent: 0,
      underMarginMode: "warn",
    });
    assert.equal(r.action, "block");
    assert.equal(r.belowCost, true);
    assert.ok(r.message?.includes("below cost"));
  });

  it("warns when under min margin in warn mode", () => {
    const r = checkMargin({
      sellPaise: 1050,
      costPaise: 1000,
      minMarginPercent: 10,
      underMarginMode: "warn",
    });
    assert.equal(r.action, "warn");
    assert.equal(r.underMinMargin, true);
    assert.ok((r.marginPercent ?? 0) < 10);
  });

  it("blocks under min margin in block mode", () => {
    const r = checkMargin({
      sellPaise: 1050,
      costPaise: 1000,
      minMarginPercent: 10,
      underMarginMode: "block",
    });
    assert.equal(r.action, "block");
  });

  it("allows healthy margin", () => {
    const r = checkMargin({
      sellPaise: 1200,
      costPaise: 1000,
      minMarginPercent: 10,
      underMarginMode: "block",
    });
    assert.equal(r.action, "allow");
    assert.equal(r.marginPercent, 20);
    assert.equal(r.message, null);
  });

  it("computes days until expiry", () => {
    const now = new Date("2026-11-15T12:00:00Z");
    assert.equal(daysUntilExpiry("2026-11-20", now), 5);
    assert.ok((daysUntilExpiry("2026-11-01", now) ?? 0) < 0);
  });
});
