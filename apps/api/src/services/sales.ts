import { nanoid } from "nanoid";
import { getDb } from "../db/schema.js";
import { checkMargin, type MarginCheckResult } from "../lib/margin.js";
import {
  computeWeightSaleAmount,
  formatWeightLabel,
  toBaseQty,
  type WeightUnit,
} from "../lib/weight.js";
import { deductStock, getInventoryItem } from "./inventory.js";
import { createPayment } from "./payments.js";
import { getActiveShop, getShop } from "./shops.js";
import type { PaymentDto } from "@nxpayment/shared";

export class MarginGuardError extends Error {
  constructor(public readonly margin: MarginCheckResult) {
    super(margin.message ?? "Margin guard blocked sale");
    this.name = "MarginGuardError";
  }
}

export interface SaleLineDto {
  id: string;
  paymentId: string;
  inventoryItemId: string | null;
  label: string;
  saleMode: "unit" | "weight";
  qty: number;
  weightUnit: WeightUnit | null;
  ratePaise: number;
  amountPaise: number;
  createdAt: string;
}

export interface QuickSaleResult {
  payment: PaymentDto;
  line: SaleLineDto;
  item: ReturnType<typeof getInventoryItem>;
  margin: MarginCheckResult;
}

function costForSale(
  item: NonNullable<ReturnType<typeof getInventoryItem>>,
  qtyDisplayOrPieces: number
): number {
  if (item.bulkQty == null || item.bulkQty <= 0 || item.bulkCostPaise == null) {
    return 0;
  }
  // bulkQty is in same display units as shelf rate for weight, or pieces for unit
  const costPer = item.bulkCostPaise / item.bulkQty;
  return Math.round(costPer * qtyDisplayOrPieces);
}

/**
 * Quick-sale from inventory → creates UPI payment and deducts stock.
 * Margin guard runs before QR/payment creation.
 */
export async function quickSale(input: {
  inventoryItemId: string;
  qty?: number;
  weightDisplay?: number;
  shopId?: string | null;
  note?: string;
  confirmDuplicate?: boolean;
  /** When true, proceed despite warn-level margin. Block still fails. */
  acceptMarginWarning?: boolean;
}): Promise<QuickSaleResult> {
  const item = getInventoryItem(input.inventoryItemId);
  if (!item) throw new Error("Item not found");
  if (item.unitPricePaise == null) throw new Error("Item has no sell price");

  const shopId = input.shopId ?? item.shopId ?? getActiveShop()?.id ?? null;
  const shop = shopId ? getShop(shopId) : getActiveShop();

  let amountPaise: number;
  let qtyRecorded: number;
  let qtyToDeduct: number;
  let label: string;
  let ratePaise = item.unitPricePaise;
  let weightUnit: WeightUnit | null = item.weightUnit;
  let saleMode = item.saleMode;
  let costBasisQty: number;

  if (item.saleMode === "weight") {
    if (!item.weightUnit) throw new Error("Item missing weight_unit");
    const w = input.weightDisplay;
    if (w == null || w <= 0) throw new Error("weightDisplay required for weight items");
    const sale = computeWeightSaleAmount({
      weightDisplay: w,
      pricePerDisplayPaise: item.unitPricePaise,
    });
    amountPaise = sale.amountPaise;
    qtyRecorded = w;
    qtyToDeduct = toBaseQty(w, item.weightUnit);
    label = `${item.name} ${formatWeightLabel(w, item.weightUnit)} @ Rs ${(ratePaise / 100).toFixed(2)}/${item.weightUnit}`;
    weightUnit = item.weightUnit;
    costBasisQty = w;
  } else {
    const q = input.qty ?? 1;
    if (q <= 0) throw new Error("qty must be positive");
    amountPaise = Math.round(q * item.unitPricePaise);
    qtyRecorded = q;
    qtyToDeduct = q;
    label = q === 1 ? item.name : `${item.name} × ${q}`;
    weightUnit = null;
    saleMode = "unit";
    costBasisQty = q;
  }

  if (amountPaise <= 0) throw new Error("Sale amount must be positive");

  const costPaise = costForSale(item, costBasisQty);
  const margin = checkMargin({
    sellPaise: amountPaise,
    costPaise,
    minMarginPercent: shop?.minMarginPercent ?? 0,
    underMarginMode: shop?.underMarginMode ?? "warn",
  });

  if (margin.action === "block") {
    throw new MarginGuardError(margin);
  }
  if (margin.action === "warn" && !input.acceptMarginWarning) {
    throw new MarginGuardError(margin);
  }

  const updatedItem = deductStock(item.id, qtyToDeduct);

  const payment = await createPayment({
    amountPaise,
    note: input.note ?? label,
    shopId,
    confirmDuplicate: input.confirmDuplicate,
  });

  const lineId = `sl_${nanoid(10)}`;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO sale_lines (
        id, payment_id, inventory_item_id, label, sale_mode, qty, weight_unit,
        rate_paise, amount_paise, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      lineId,
      payment.id,
      item.id,
      label,
      saleMode,
      qtyRecorded,
      weightUnit,
      ratePaise,
      amountPaise,
      now
    );

  return {
    payment,
    line: {
      id: lineId,
      paymentId: payment.id,
      inventoryItemId: item.id,
      label,
      saleMode,
      qty: qtyRecorded,
      weightUnit,
      ratePaise,
      amountPaise,
      createdAt: now,
    },
    item: updatedItem,
    margin,
  };
}

/** Preview margin without creating a payment. */
export function previewSaleMargin(input: {
  inventoryItemId: string;
  qty?: number;
  weightDisplay?: number;
  shopId?: string | null;
}): MarginCheckResult {
  const item = getInventoryItem(input.inventoryItemId);
  if (!item || item.unitPricePaise == null) {
    throw new Error("Item not found or missing price");
  }
  const shopId = input.shopId ?? item.shopId ?? getActiveShop()?.id ?? null;
  const shop = shopId ? getShop(shopId) : getActiveShop();

  let sell: number;
  let costQty: number;
  if (item.saleMode === "weight") {
    const w = input.weightDisplay ?? 1;
    sell = computeWeightSaleAmount({
      weightDisplay: w,
      pricePerDisplayPaise: item.unitPricePaise,
    }).amountPaise;
    costQty = w;
  } else {
    const q = input.qty ?? 1;
    sell = Math.round(q * item.unitPricePaise);
    costQty = q;
  }

  return checkMargin({
    sellPaise: sell,
    costPaise: costForSale(item, costQty),
    minMarginPercent: shop?.minMarginPercent ?? 0,
    underMarginMode: shop?.underMarginMode ?? "warn",
  });
}

export function listSaleLines(paymentId: string): SaleLineDto[] {
  const rows = getDb()
    .prepare(`SELECT * FROM sale_lines WHERE payment_id = ? ORDER BY created_at ASC`)
    .all(paymentId) as Array<{
    id: string;
    payment_id: string;
    inventory_item_id: string | null;
    label: string;
    sale_mode: string;
    qty: number;
    weight_unit: string | null;
    rate_paise: number;
    amount_paise: number;
    created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    paymentId: r.payment_id,
    inventoryItemId: r.inventory_item_id,
    label: r.label,
    saleMode: r.sale_mode === "weight" ? "weight" : "unit",
    qty: r.qty,
    weightUnit: r.weight_unit as WeightUnit | null,
    ratePaise: r.rate_paise,
    amountPaise: r.amount_paise,
    createdAt: r.created_at,
  }));
}
