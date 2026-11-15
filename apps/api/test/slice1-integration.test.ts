import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { resetDbForTests } from "../src/db/schema.js";
import { computeGst } from "../src/lib/money-gst.js";
import {
  createDisplaySession,
  getDisplayState,
} from "../src/services/display.js";
import { updateGstSettings } from "../src/services/gst-settings.js";
import {
  createInventoryItem,
  listInventory,
  deleteInventoryItem,
} from "../src/services/inventory.js";
import {
  createPayment,
  merchantConfirm,
  getTally,
} from "../src/services/payments.js";
import {
  chartByDayOfWeek,
  getReportTotals,
  resolvePeriod,
} from "../src/services/reports.js";
import {
  createLocation,
  createShop,
  getActiveShop,
  listLocations,
  setActiveShop,
} from "../src/services/shops.js";
import {
  getStorageSettings,
  runSecondaryBackup,
  updateStorageSettings,
} from "../src/services/storage.js";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nxp-slice1-"));
const dbPath = path.join(tmpRoot, "test.sqlite");

describe("Slice 1 integration", () => {
  before(() => {
    resetDbForTests(dbPath);
  });

  after(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("storage config persists modes and secondary backup copies", () => {
    const secondary = path.join(tmpRoot, "backup", "secondary.sqlite");
    let storage = updateStorageSettings({
      mode: "local_replica",
      secondaryPath: secondary,
      onlinePrimaryEnabled: false,
    });
    assert.equal(storage.mode, "local_replica");
    assert.equal(storage.secondaryPath, secondary);
    assert.equal(storage.primaryExists, true);

    const online = updateStorageSettings({
      mode: "hybrid",
      onlinePrimaryEnabled: true,
      onlineConnectionString: "postgres://user:pass@localhost:5432/nxp",
    });
    assert.equal(online.onlineConnectionConfigured, true);
    assert.equal(online.onlinePrimaryStatus, "stub_coming_slice2");
    assert.ok(online.sliceNote);

    // Clear secret from response path — status must not leak plaintext
    const status = getStorageSettings();
    assert.equal(status.onlineConnectionConfigured, true);
    assert.ok(!("onlineConnectionString" in status));

    const backup = runSecondaryBackup();
    assert.equal(backup.ok, true);
    assert.ok(fs.existsSync(secondary));
  });

  it("shops, locations, inventory CRUD with active shop", () => {
    const defaultShop = getActiveShop();
    assert.ok(defaultShop);

    const cafe = createShop({ name: "Cafe Annex", vpaOverride: "cafe@upi" });
    assert.equal(cafe.name, "Cafe Annex");
    setActiveShop(cafe.id);
    assert.equal(getActiveShop()?.id, cafe.id);

    const shelf = createLocation(cafe.id, "Front shelf");
    assert.equal(shelf.name, "Front shelf");
    assert.equal(listLocations(cafe.id).length, 1);

    const item = createInventoryItem({
      shopId: cafe.id,
      name: "Filter coffee",
      sku: "COFFEE-1",
      qty: 12,
      unitPricePaise: 4000,
      bulkQty: 10,
      bulkCostPaise: 25000,
      locationId: shelf.id,
    });
    assert.equal(listInventory(cafe.id).length, 1);
    assert.equal(item.locationName, "Front shelf");
    assert.ok(item.pricing);
    assert.equal(item.pricing!.costPerUnitPaise, 2500);
    deleteInventoryItem(item.id);
    assert.equal(listInventory(cafe.id).length, 0);

    const pharmacy = createShop({ name: "Local Chemist", businessType: "pharmacy" });
    assert.equal(pharmacy.businessType, "pharmacy");
    const tab = createInventoryItem({
      shopId: pharmacy.id,
      name: "Paracetamol 500",
      qty: 200,
      unitPricePaise: 200,
      bulkQty: 100,
      bulkCostPaise: 12000,
      packSize: "10 tablets",
      batchNo: "B12",
      expiryDate: "2027-06-30",
    });
    assert.equal(tab.batchNo, "B12");
    assert.equal(tab.packSize, "10 tablets");
    assert.ok(tab.pricing);

    // Restore default for payment tests
    if (defaultShop) setActiveShop(defaultShop.id);
  });

  it("display session happy path shows open payment", async () => {
    const shop = getActiveShop();
    assert.ok(shop);
    const session = createDisplaySession({ shopId: shop.id, label: "Counter" });
    assert.match(session.code, /^[A-Z0-9]{6}$/);
    assert.equal(session.urlPath, `/display/${session.code}`);

    let state = getDisplayState(session.code);
    assert.ok(state);
    assert.ok(state.status === "idle" || state.status === "paid" || state.status === "waiting");

    const payment = await createPayment({
      amountPaise: 2500,
      note: "display-test",
      shopId: shop.id,
    });
    assert.equal(payment.status, "ACTIVE");

    state = getDisplayState(session.code);
    assert.ok(state);
    assert.equal(state.status, "waiting");
    assert.equal(state.amountPaise, 2500);
    assert.ok(state.payment?.upiUri.startsWith("upi://"));
    assert.ok(state.merchantName);

    await merchantConfirm(payment.id);
    state = getDisplayState(session.code);
    assert.ok(state);
    assert.equal(state.status, "paid");
  });

  it("GST snapshot on settle feeds report aggregates", async () => {
    updateGstSettings({
      ratePercent: 18,
      splitMode: "cgst_sgst",
      priceMode: "inclusive",
      fyStartMonth: 4,
    });

    const expected = computeGst({
      amountPaise: 11800,
      ratePercent: 18,
      splitMode: "cgst_sgst",
      priceMode: "inclusive",
    });

    const payment = await createPayment({
      amountPaise: 11800,
      note: "gst-report",
      confirmDuplicate: true,
    });
    await merchantConfirm(payment.id);

    const window = resolvePeriod({ period: "daily", date: new Date().toISOString() });
    const totals = getReportTotals({
      from: window.from,
      to: window.to,
      period: "daily",
      label: window.label,
      shopId: getActiveShop()?.id ?? null,
    });
    assert.ok(totals.successCount >= 1);
    assert.ok(totals.gstCollectedPaise >= expected.totalTaxPaise);
    assert.ok(totals.avgTicketPaise > 0);

    const dow = chartByDayOfWeek({ from: window.from, to: window.to });
    assert.equal(dow.length, 7);

    const tally = getTally(window.from, window.to, getActiveShop()?.id ?? null);
    assert.ok(tally.successCount >= 1);
  });
});
