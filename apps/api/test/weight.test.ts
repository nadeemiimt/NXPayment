import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { resetDbForTests } from "../src/db/schema.js";
import {
  computeWeightProfit,
  computeWeightSaleAmount,
  toBaseQty,
} from "../src/lib/weight.js";
import {
  createInventoryItem,
  getInventoryItem,
} from "../src/services/inventory.js";
import { quickSale } from "../src/services/sales.js";
import { getActiveShop } from "../src/services/shops.js";

describe("weight pricing math", () => {
  it("charges rate × weight", () => {
    // 0.25 kg @ ₹80/kg = ₹20
    const s = computeWeightSaleAmount({
      weightDisplay: 0.25,
      pricePerDisplayPaise: 8000,
    });
    assert.equal(s.amountPaise, 2000);
  });

  it("computes weight profit from bulk cost", () => {
    // 10 kg cost ₹500 → ₹50/kg; sell 2 kg @ ₹80 → revenue 160, cost 100, profit 60
    const p = computeWeightProfit({
      weightDisplay: 2,
      pricePerDisplayPaise: 8000,
      bulkQtyDisplay: 10,
      bulkCostPaise: 50_000,
    });
    assert.equal(p.amountPaise, 16_000);
    assert.equal(p.costPaise, 10_000);
    assert.equal(p.profitPaise, 6_000);
  });

  it("converts kg to base grams", () => {
    assert.equal(toBaseQty(1.5, "kg"), 1500);
    assert.equal(toBaseQty(250, "g"), 250);
  });
});

describe("weight stock deduction", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nxp-wt-"));
  before(() => resetDbForTests(path.join(tmp, "w.sqlite")));
  after(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("quick-sale deducts base units and creates payment", async () => {
    const shop = getActiveShop()!;
    const item = createInventoryItem({
      shopId: shop.id,
      name: "Loose rice",
      saleMode: "weight",
      weightUnit: "kg",
      qtyDisplay: 10, // 10 kg → 10000 g
      unitPricePaise: 8000,
      bulkQty: 10,
      bulkCostPaise: 50_000,
    });
    assert.equal(item.qty, 10_000);
    assert.equal(item.saleMode, "weight");

    const sale = await quickSale({
      inventoryItemId: item.id,
      weightDisplay: 0.5,
      confirmDuplicate: true,
    });
    assert.equal(sale.payment.amountPaise, 4000);
    assert.equal(sale.line.saleMode, "weight");
    assert.ok(sale.line.label.includes("kg"));

    const after = getInventoryItem(item.id)!;
    assert.equal(after.qty, 9500); // 0.5 kg = 500 g deducted
  });
});
