import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { resetDbForTests } from "../src/db/schema.js";
import {
  centerLine,
  charsPerLine,
  encodeEscPosReceipt,
} from "../src/lib/escpos.js";
import { createPayment, merchantConfirm } from "../src/services/payments.js";
import {
  buildEscPosBinary,
  buildReceipt,
  getReceiptSettings,
  sendToPrintBridge,
  updateReceiptSettings,
} from "../src/services/receipts.js";
import { updateGstSettings } from "../src/services/gst-settings.js";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nxp-receipt-"));
const dbPath = path.join(tmpRoot, "receipt.sqlite");

describe("ESC/POS helpers", () => {
  it("uses 32 cols for 58mm and 48 for 80mm", () => {
    assert.equal(charsPerLine(58), 32);
    assert.equal(charsPerLine(80), 48);
  });

  it("centers text and encodes init + cut bytes", () => {
    assert.equal(centerLine("Hi", 6), "  Hi");
    const buf = encodeEscPosReceipt({
      lines: ["NXPayment", "TOTAL"],
      widthMm: 58,
      cut: true,
    });
    assert.ok(buf.length > 10);
    assert.equal(buf[0], 0x1b);
    assert.equal(buf[1], 0x40);
    // GS V 1 partial cut near end
    assert.ok(buf.includes(0x1d));
  });
});

describe("receipt build", () => {
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

  it("settings persist paper width and header/footer", () => {
    const updated = updateReceiptSettings({
      paperWidthMm: 80,
      headerText: "Local Kirana",
      footerText: "GSTIN: DEMO",
      thankYouText: "Shukriya!",
    });
    assert.equal(updated.paperWidthMm, 80);
    assert.equal(updated.headerText, "Local Kirana");
    assert.equal(getReceiptSettings().thankYouText, "Shukriya!");
    assert.equal(updated.printBridge.status, "stub");
  });

  it("builds receipt with GST after confirm and ESC/POS bytes", async () => {
    updateGstSettings({
      ratePercent: 18,
      splitMode: "cgst_sgst",
      priceMode: "inclusive",
    });
    const payment = await createPayment({
      amountPaise: 11800,
      note: "Biscuits pack",
      confirmDuplicate: true,
    });
    await merchantConfirm(payment.id);

    const receipt = buildReceipt(payment.id);
    assert.ok(receipt);
    assert.equal(receipt!.amountPaise, 11800);
    assert.ok(receipt!.shopName);
    assert.ok(receipt!.textLines.some((l) => l.includes("Biscuits") || l.includes("TOTAL")));
    assert.ok(receipt!.gst);
    assert.ok((receipt!.gst!.cgstPaise ?? 0) + (receipt!.gst!.sgstPaise ?? 0) > 0);
    assert.ok(receipt!.textLines.some((l) => /CGST|SGST|GST/.test(l)));
    assert.ok(receipt!.textLines.some((l) => l.includes("UPI:")));
    assert.ok(receipt!.textLines.some((l) => l.includes("Shukriya") || l.includes("Thank")));

    const bin = buildEscPosBinary(payment.id);
    assert.ok(bin && bin.length > 20);

    const bridge = sendToPrintBridge(payment.id);
    assert.equal(bridge.ok, false);
    assert.equal(bridge.status, "stub_not_connected");
  });
});
