import { nanoid } from "nanoid";
import { getDb } from "../db/schema.js";
import {
  computeWeightSaleAmount,
  formatWeightLabel,
  toBaseQty,
  type WeightUnit,
} from "../lib/weight.js";
import {
  deductStock,
  getInventoryItem,
} from "./inventory.js";
import { createPayment } from "./payments.js";
import { getActiveShop } from "./shops.js";
import type { PaymentDto } from "@nxpayment/shared";

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
}

/**
 * Quick-sale from inventory → creates UPI payment and deducts stock.
 * For weight items, pass `weightDisplay` in the item's weight unit.
 */
export async function quickSale(input: {
  inventoryItemId: string;
  /** Pieces for unit items; ignored for weight if weightDisplay set. */
  qty?: number;
  /** Weighed amount in display unit (kg/g/L/ml). */
  weightDisplay?: number;
  shopId?: string | null;
  note?: string;
  confirmDuplicate?: boolean;
}): Promise<QuickSaleResult> {
  const item = getInventoryItem(input.inventoryItemId);
  if (!item) throw new Error("Item not found");
  if (item.unitPricePaise == null) throw new Error("Item has no sell price");

  const shopId = input.shopId ?? item.shopId ?? getActiveShop()?.id ?? null;

  let amountPaise: number;
  let qtyRecorded: number;
  let qtyToDeduct: number;
  let label: string;
  let ratePaise = item.unitPricePaise;
  let weightUnit: WeightUnit | null = item.weightUnit;
  let saleMode = item.saleMode;

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
  } else {
    const q = input.qty ?? 1;
    if (q <= 0) throw new Error("qty must be positive");
    amountPaise = Math.round(q * item.unitPricePaise);
    qtyRecorded = q;
    qtyToDeduct = q;
    label = q === 1 ? item.name : `${item.name} × ${q}`;
    weightUnit = null;
    saleMode = "unit";
  }

  if (amountPaise <= 0) throw new Error("Sale amount must be positive");

  // Deduct first so we don't open a payment we can't fulfill
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
  };
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
