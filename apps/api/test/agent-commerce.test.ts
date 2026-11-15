import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { resetDbForTests } from "../src/db/schema.js";
import {
  AgentAuthError,
  authenticateAgentBearer,
  generateAgentKey,
} from "../src/services/agent-keys.js";
import {
  agentCreatePayment,
  agentGetPayment,
  agentListCatalog,
  agentQuoteCart,
} from "../src/services/agent-commerce.js";
import { createInventoryItem } from "../src/services/inventory.js";
import { updateProviderSettings } from "../src/services/providers.js";
import { getActiveShop } from "../src/services/shops.js";
import { merchantConfirm } from "../src/services/payments.js";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nxp-agent-"));
const dbPath = path.join(tmpRoot, "test.sqlite");

describe("agent commerce", () => {
  let apiKey = "";
  let itemId = "";

  before(() => {
    resetDbForTests(dbPath);
    const shop = getActiveShop();
    assert.ok(shop);
    const item = createInventoryItem({
      shopId: shop.id,
      name: "Agent Biscuits",
      qty: 100,
      unitPricePaise: 400,
      bulkQty: 1000,
      bulkCostPaise: 350000,
    });
    itemId = item.id;
    updateProviderSettings({ agentsEnabled: true, upiEnabled: true });
    const generated = generateAgentKey("test");
    apiKey = generated.apiKey;
  });

  after(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("rejects missing / invalid bearer", () => {
    assert.throws(
      () => authenticateAgentBearer(undefined),
      (e: unknown) => e instanceof AgentAuthError && e.code === "missing_key"
    );
    assert.throws(
      () => authenticateAgentBearer("Bearer wrong"),
      (e: unknown) => e instanceof AgentAuthError && e.code === "invalid_key"
    );
  });

  it("accepts hashed agent key", () => {
    const auth = authenticateAgentBearer(`Bearer ${apiKey}`);
    assert.ok(auth.keyId);
    assert.ok(auth.keyPrefix.startsWith("nxp_agent_"));
  });

  it("lists catalog and quotes cart", () => {
    const catalog = agentListCatalog();
    assert.ok(catalog.items.some((i) => i.id === itemId));
    const quote = agentQuoteCart({
      lines: [{ itemId, qty: 10 }],
    });
    assert.equal(quote.totalPaise, 4000);
    assert.equal(quote.lines[0].name, "Agent Biscuits");
  });

  it("create + status happy path returns UPI payload", async () => {
    const created = await agentCreatePayment({
      lines: [{ itemId, qty: 2 }],
      confirmDuplicate: true,
      idempotencyKey: `agent-test-${Date.now()}`,
    });
    assert.equal(created.amountPaise, 800);
    assert.ok(created.upiUri?.startsWith("upi://"));
    assert.equal(created.qrPayload, created.upiUri);
    assert.ok(created.deepLinks.gpay);
    assert.equal(created.provider, "upi_direct");
    assert.equal(created.payment.status, "ACTIVE");

    const status = await agentGetPayment(created.payment.id);
    assert.ok(status);
    assert.equal(status.payment.id, created.payment.id);
    assert.equal(status.provider, "upi_direct");
    assert.equal(status.payment.status, "ACTIVE");

    const confirmed = await merchantConfirm(created.payment.id);
    assert.equal(confirmed.status, "SUCCESS");
  });

  it("blocks agent API when shopping agents disabled", () => {
    updateProviderSettings({ agentsEnabled: false });
    assert.throws(
      () => authenticateAgentBearer(`Bearer ${apiKey}`),
      (e: unknown) => e instanceof AgentAuthError && e.code === "agents_disabled"
    );
    updateProviderSettings({ agentsEnabled: true });
  });
});
