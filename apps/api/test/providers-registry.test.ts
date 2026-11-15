import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { resetDbForTests } from "../src/db/schema.js";
import {
  NoProviderAvailableError,
  resolveProviderOrder,
  selectProvider,
} from "../src/rails/registry.js";
import { cardPartnerVisa } from "../src/rails/card-stubs.js";
import {
  getProviderSettings,
  updateProviderSettings,
} from "../src/services/providers.js";
import { createPayment } from "../src/services/payments.js";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nxp-prov-"));
const dbPath = path.join(tmpRoot, "test.sqlite");

describe("provider registry", () => {
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

  it("defaults to UPI primary with cards/other off", () => {
    const s = getProviderSettings();
    assert.equal(s.upiEnabled, true);
    assert.equal(s.cardsEnabled, false);
    assert.equal(s.otherEnabled, false);
    assert.equal(s.primaryProvider, "upi_direct");
    assert.equal(s.backupProvider, null);
    assert.equal(s.agentsEnabled, false);
  });

  it("resolveProviderOrder picks UPI then optional backup", () => {
    const onlyUpi = resolveProviderOrder({
      upiEnabled: true,
      cardsEnabled: false,
      otherEnabled: false,
      primaryProvider: "upi_direct",
      backupProvider: "authorize_net",
    });
    assert.equal(onlyUpi.length, 1);
    assert.equal(onlyUpi[0].id, "upi_direct");

    const withBackup = resolveProviderOrder({
      upiEnabled: true,
      cardsEnabled: false,
      otherEnabled: true,
      primaryProvider: "upi_direct",
      backupProvider: "authorize_net",
    });
    assert.deepEqual(
      withBackup.map((p) => p.id),
      ["upi_direct", "authorize_net"]
    );
  });

  it("selectProvider returns upi_direct when healthy", async () => {
    const { provider, health } = await selectProvider({
      upiEnabled: true,
      cardsEnabled: true,
      otherEnabled: false,
      primaryProvider: "upi_direct",
      backupProvider: "card_partner_visa",
    });
    assert.equal(provider.id, "upi_direct");
    assert.equal(health, "up");
  });

  it("selectProvider skips not_configured primary and uses UPI backup", async () => {
    const { provider } = await selectProvider({
      upiEnabled: true,
      cardsEnabled: true,
      otherEnabled: false,
      primaryProvider: "card_partner_visa",
      backupProvider: "upi_direct",
    });
    assert.equal(provider.id, "upi_direct");
  });

  it("selectProvider errors when nothing enabled", async () => {
    await assert.rejects(
      () =>
        selectProvider({
          upiEnabled: false,
          cardsEnabled: false,
          otherEnabled: false,
          primaryProvider: "upi_direct",
          backupProvider: null,
        }),
      (err: unknown) => err instanceof NoProviderAvailableError
    );
  });

  it("card stub createPayment returns notConfigured", async () => {
    const checkout = await cardPartnerVisa.createPayment({
      id: "pay_test",
      amountPaise: 100,
      receivingVpa: "shop@upi",
      receivingName: "Shop",
    });
    assert.equal(checkout.notConfigured, true);
    assert.equal(checkout.upiUri, null);
    assert.ok(checkout.message?.includes("not configured"));
  });

  it("updateProviderSettings clears backup when only one category on", () => {
    updateProviderSettings({
      upiEnabled: true,
      cardsEnabled: true,
      otherEnabled: false,
      primaryProvider: "upi_direct",
      backupProvider: "card_partner_visa",
    });
    let s = getProviderSettings();
    assert.equal(s.backupProvider, "card_partner_visa");

    s = updateProviderSettings({ cardsEnabled: false });
    assert.equal(s.cardsEnabled, false);
    assert.equal(s.backupProvider, null);
  });

  it("createPayment uses registry and tags provider_id", async () => {
    updateProviderSettings({
      upiEnabled: true,
      cardsEnabled: false,
      otherEnabled: false,
      primaryProvider: "upi_direct",
    });
    const payment = await createPayment({
      amountPaise: 19900,
      note: "registry test",
      confirmDuplicate: true,
    });
    assert.equal(payment.providerId, "upi_direct");
    assert.ok(payment.upiUri.startsWith("upi://"));
  });
});
