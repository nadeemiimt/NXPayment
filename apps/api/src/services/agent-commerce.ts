import { getInventoryItem, listInventory } from "./inventory.js";
import {
  SameAmountInProgressError,
  createPayment,
  getPayment,
  merchantConfirm,
} from "./payments.js";
import { getActiveShop } from "./shops.js";
import { pickCheckoutProvider } from "./providers.js";
import { getProvider } from "../rails/registry.js";
import { buildUpiDeepLinks } from "../rails/deep-links.js";

export interface AgentCatalogItem {
  id: string;
  name: string;
  sku: string | null;
  unitPricePaise: number | null;
  qty: number;
  saleMode: string;
  weightUnit: string | null;
}

export interface AgentQuoteLine {
  itemId: string;
  name: string;
  qty: number;
  unitPricePaise: number;
  linePaise: number;
}

export interface AgentQuote {
  shopId: string;
  lines: AgentQuoteLine[];
  totalPaise: number;
  currency: "INR";
}

export function agentListCatalog(opts?: {
  shopId?: string;
  page?: number;
  pageSize?: number;
  q?: string;
}): {
  shopId: string;
  items: AgentCatalogItem[];
  page: number;
  pageSize: number;
  total: number;
} {
  const shopId = opts?.shopId ?? getActiveShop()?.id;
  if (!shopId) throw new Error("No active shop");
  const page = listInventory(shopId, {
    page: opts?.page,
    pageSize: opts?.pageSize ?? 50,
    q: opts?.q,
  });
  return {
    shopId,
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
    items: page.items.map((i) => ({
      id: i.id,
      name: i.name,
      sku: i.sku,
      unitPricePaise: i.unitPricePaise,
      qty: i.qtyDisplay ?? i.qty,
      saleMode: i.saleMode,
      weightUnit: i.weightUnit,
    })),
  };
}

export function agentQuoteCart(input: {
  shopId?: string;
  lines: Array<{ itemId: string; qty: number }>;
}): AgentQuote {
  const shopId = input.shopId ?? getActiveShop()?.id;
  if (!shopId) throw new Error("No active shop");
  if (!input.lines.length) throw new Error("Cart is empty");

  const lines: AgentQuoteLine[] = [];
  let totalPaise = 0;
  for (const line of input.lines) {
    if (!Number.isFinite(line.qty) || line.qty <= 0) {
      throw new Error(`Invalid qty for ${line.itemId}`);
    }
    const item = getInventoryItem(line.itemId);
    if (!item || item.shopId !== shopId) {
      throw new Error(`Unknown item ${line.itemId}`);
    }
    if (item.unitPricePaise == null) {
      throw new Error(`Item ${item.name} has no sell price`);
    }
    const linePaise = Math.round(item.unitPricePaise * line.qty);
    lines.push({
      itemId: item.id,
      name: item.name,
      qty: line.qty,
      unitPricePaise: item.unitPricePaise,
      linePaise,
    });
    totalPaise += linePaise;
  }
  if (totalPaise <= 0) throw new Error("Quote total must be positive");
  return { shopId, lines, totalPaise, currency: "INR" };
}

export async function agentCreatePayment(input: {
  amountPaise?: number;
  lines?: Array<{ itemId: string; qty: number }>;
  shopId?: string;
  note?: string;
  merchantOrderId?: string;
  idempotencyKey?: string;
  confirmDuplicate?: boolean;
}) {
  let amountPaise = input.amountPaise;
  let note = input.note;
  let shopId = input.shopId;

  if (input.lines?.length) {
    const quote = agentQuoteCart({ shopId, lines: input.lines });
    amountPaise = quote.totalPaise;
    shopId = quote.shopId;
    if (!note) {
      note = quote.lines.map((l) => `${l.name}×${l.qty}`).join(", ").slice(0, 240);
    }
  }

  if (amountPaise == null) throw new Error("amountPaise or lines required");

  const { provider } = await pickCheckoutProvider();
  const payment = await createPayment({
    amountPaise,
    shopId,
    note,
    merchantOrderId: input.merchantOrderId,
    idempotencyKey: input.idempotencyKey,
    confirmDuplicate: input.confirmDuplicate,
    providerId: provider.id,
  });

  const deepLinks =
    payment.upiUri && payment.upiUri.startsWith("upi://")
      ? buildUpiDeepLinks(payment.upiUri)
      : {};

  return {
    payment,
    amountPaise: payment.amountPaise,
    upiUri: payment.upiUri,
    qrPayload: payment.upiUri,
    deepLinks,
    provider: payment.providerId ?? provider.id,
  };
}

export async function agentGetPayment(id: string) {
  const payment = getPayment(id);
  if (!payment) return null;
  const providerId = payment.providerId ?? "upi_direct";
  const provider = getProvider(providerId);
  const providerStatus = provider ? await provider.getStatus(id) : null;
  const deepLinks =
    payment.upiUri && payment.upiUri.startsWith("upi://")
      ? buildUpiDeepLinks(payment.upiUri)
      : {};
  return {
    payment,
    amountPaise: payment.amountPaise,
    upiUri: payment.upiUri,
    qrPayload: payment.upiUri,
    deepLinks,
    provider: providerId,
    providerStatus,
  };
}

export async function agentConfirmPayment(id: string) {
  return merchantConfirm(id);
}

export { SameAmountInProgressError };
