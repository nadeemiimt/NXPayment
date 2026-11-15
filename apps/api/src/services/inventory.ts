import { nanoid } from "nanoid";
import { getDb } from "../db/schema.js";
import {
  computeUnitPricing,
  projectProfit,
  type PricingBreakdown,
  type ProjectedProfit,
} from "../lib/pricing.js";
import {
  computeWeightProfit,
  fromBaseQty,
  toBaseQty,
  type SaleMode,
  type WeightUnit,
} from "../lib/weight.js";
import { getShop } from "./shops.js";

export interface InventoryItemDto {
  id: string;
  shopId: string;
  locationId: string | null;
  locationName: string | null;
  name: string;
  sku: string | null;
  /** Stock in base units for weight items (g/ml), pieces for unit items. */
  qty: number;
  /** Display stock for weight items (converted to weight_unit). */
  qtyDisplay: number | null;
  unitPricePaise: number | null;
  bulkQty: number | null;
  bulkCostPaise: number | null;
  packSize: string | null;
  batchNo: string | null;
  expiryDate: string | null;
  saleMode: SaleMode;
  weightUnit: WeightUnit | null;
  pricing: PricingBreakdown | null;
  projectedProfit: ProjectedProfit | null;
  createdAt: string;
  updatedAt: string;
}

interface ItemRow {
  id: string;
  shop_id: string;
  location_id: string | null;
  name: string;
  sku: string | null;
  qty: number;
  unit_price_paise: number | null;
  bulk_qty: number | null;
  bulk_cost_paise: number | null;
  pack_size: string | null;
  batch_no: string | null;
  expiry_date: string | null;
  sale_mode: string;
  weight_unit: string | null;
  created_at: string;
  updated_at: string;
  location_name?: string | null;
}

function attachPricing(row: ItemRow, projectSellQty?: number): InventoryItemDto {
  const saleMode = (row.sale_mode === "weight" ? "weight" : "unit") as SaleMode;
  const weightUnit = (row.weight_unit as WeightUnit | null) ?? null;
  let pricing: PricingBreakdown | null = null;
  let projectedProfit: ProjectedProfit | null = null;

  if (
    row.bulk_qty != null &&
    row.bulk_qty > 0 &&
    row.bulk_cost_paise != null &&
    row.unit_price_paise != null
  ) {
    try {
      if (saleMode === "weight") {
        const n = projectSellQty ?? 1;
        const wp = computeWeightProfit({
          weightDisplay: n,
          pricePerDisplayPaise: row.unit_price_paise,
          bulkQtyDisplay: row.bulk_qty,
          bulkCostPaise: row.bulk_cost_paise,
        });
        pricing = {
          bulkQty: row.bulk_qty,
          bulkCostPaise: row.bulk_cost_paise,
          unitPricePaise: row.unit_price_paise,
          costPerUnitPaise: Math.round(wp.costPerDisplayPaiseExact),
          costPerUnitPaiseExact: wp.costPerDisplayPaiseExact,
          profitPerUnitPaise: Math.round(wp.profitPerDisplayPaiseExact),
          profitPerUnitPaiseExact: wp.profitPerDisplayPaiseExact,
        };
        projectedProfit = {
          sellQty: n,
          profitPaise: wp.profitPaise,
          profitPaiseExact: wp.profitPaise,
          revenuePaise: wp.amountPaise,
          costPaise: wp.costPaise,
        };
      } else {
        const input = {
          bulkQty: row.bulk_qty,
          bulkCostPaise: row.bulk_cost_paise,
          unitPricePaise: row.unit_price_paise,
        };
        pricing = computeUnitPricing(input);
        const n = projectSellQty ?? (row.qty > 0 ? Math.min(100, row.qty) : 100);
        projectedProfit = projectProfit(input, n);
      }
    } catch {
      pricing = null;
      projectedProfit = null;
    }
  }

  const qtyDisplay =
    saleMode === "weight" && weightUnit ? fromBaseQty(row.qty, weightUnit) : null;

  return {
    id: row.id,
    shopId: row.shop_id,
    locationId: row.location_id,
    locationName: row.location_name ?? null,
    name: row.name,
    sku: row.sku,
    qty: row.qty,
    qtyDisplay,
    unitPricePaise: row.unit_price_paise,
    bulkQty: row.bulk_qty,
    bulkCostPaise: row.bulk_cost_paise,
    packSize: row.pack_size,
    batchNo: row.batch_no,
    expiryDate: row.expiry_date,
    saleMode,
    weightUnit,
    pricing,
    projectedProfit,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InventoryPage {
  items: InventoryItemDto[];
  shopId: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function listInventory(
  shopId: string,
  opts?: { page?: number; pageSize?: number; q?: string }
): InventoryPage {
  const page = Math.max(1, opts?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts?.pageSize ?? 25));
  const q = opts?.q?.trim();

  let where = `i.shop_id = ? AND i.deleted_at IS NULL`;
  const params: unknown[] = [shopId];
  if (q) {
    where += ` AND (i.name LIKE ? OR IFNULL(i.sku,'') LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`);
  }

  const total = (
    getDb()
      .prepare(`SELECT COUNT(*) as c FROM inventory_items i WHERE ${where}`)
      .get(...params) as { c: number }
  ).c;

  const offset = (page - 1) * pageSize;
  const rows = getDb()
    .prepare(
      `SELECT i.*, l.name as location_name
       FROM inventory_items i
       LEFT JOIN locations l ON l.id = i.location_id AND l.deleted_at IS NULL
       WHERE ${where}
       ORDER BY i.name ASC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset) as ItemRow[];

  return {
    items: rows.map((r) => attachPricing(r)),
    shopId,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function getInventoryItem(
  id: string,
  projectSellQty?: number
): InventoryItemDto | null {
  const row = getDb()
    .prepare(
      `SELECT i.*, l.name as location_name
       FROM inventory_items i
       LEFT JOIN locations l ON l.id = i.location_id AND l.deleted_at IS NULL
       WHERE i.id = ? AND i.deleted_at IS NULL`
    )
    .get(id) as ItemRow | undefined;
  return row ? attachPricing(row, projectSellQty) : null;
}

export function createInventoryItem(input: {
  shopId: string;
  name: string;
  sku?: string | null;
  qty?: number;
  /** For weight items: qty in display unit; stored as base. */
  qtyDisplay?: number;
  unitPricePaise: number;
  bulkQty: number;
  bulkCostPaise: number;
  locationId?: string | null;
  packSize?: string | null;
  batchNo?: string | null;
  expiryDate?: string | null;
  saleMode?: SaleMode;
  weightUnit?: WeightUnit | null;
}): InventoryItemDto {
  if (!getShop(input.shopId)) throw new Error("Shop not found");
  const saleMode = input.saleMode ?? "unit";
  const weightUnit = saleMode === "weight" ? (input.weightUnit ?? "kg") : null;
  if (saleMode === "weight" && !weightUnit) throw new Error("weightUnit required");

  if (saleMode === "unit") {
    computeUnitPricing({
      bulkQty: input.bulkQty,
      bulkCostPaise: input.bulkCostPaise,
      unitPricePaise: input.unitPricePaise,
    });
  } else {
    computeWeightProfit({
      weightDisplay: 1,
      pricePerDisplayPaise: input.unitPricePaise,
      bulkQtyDisplay: input.bulkQty,
      bulkCostPaise: input.bulkCostPaise,
    });
  }

  let qty = input.qty ?? 0;
  if (saleMode === "weight" && weightUnit) {
    const display = input.qtyDisplay ?? input.qty ?? 0;
    qty = toBaseQty(display, weightUnit);
  }

  const id = `inv_${nanoid(10)}`;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO inventory_items (
        id, shop_id, location_id, name, sku, qty, unit_price_paise,
        bulk_qty, bulk_cost_paise, pack_size, batch_no, expiry_date,
        sale_mode, weight_unit, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    )
    .run(
      id,
      input.shopId,
      input.locationId ?? null,
      input.name,
      input.sku ?? null,
      qty,
      input.unitPricePaise,
      input.bulkQty,
      input.bulkCostPaise,
      input.packSize ?? null,
      input.batchNo ?? null,
      input.expiryDate ?? null,
      saleMode,
      weightUnit,
      now,
      now
    );
  return getInventoryItem(id)!;
}

export function updateInventoryItem(
  id: string,
  input: {
    name?: string;
    sku?: string | null;
    qty?: number;
    qtyDisplay?: number;
    unitPricePaise?: number;
    bulkQty?: number;
    bulkCostPaise?: number;
    locationId?: string | null;
    packSize?: string | null;
    batchNo?: string | null;
    expiryDate?: string | null;
    saleMode?: SaleMode;
    weightUnit?: WeightUnit | null;
  }
): InventoryItemDto {
  const current = getInventoryItem(id);
  if (!current) throw new Error("Item not found");

  const saleMode = input.saleMode ?? current.saleMode;
  const weightUnit =
    saleMode === "weight"
      ? (input.weightUnit !== undefined ? input.weightUnit : current.weightUnit) ?? "kg"
      : null;

  let qty = input.qty !== undefined ? input.qty : current.qty;
  if (saleMode === "weight" && weightUnit && input.qtyDisplay !== undefined) {
    qty = toBaseQty(input.qtyDisplay, weightUnit);
  }

  const next = {
    name: input.name ?? current.name,
    sku: input.sku !== undefined ? input.sku : current.sku,
    qty,
    unitPricePaise:
      input.unitPricePaise !== undefined
        ? input.unitPricePaise
        : (current.unitPricePaise ?? 0),
    bulkQty: input.bulkQty !== undefined ? input.bulkQty : (current.bulkQty ?? 1),
    bulkCostPaise:
      input.bulkCostPaise !== undefined
        ? input.bulkCostPaise
        : (current.bulkCostPaise ?? 0),
    locationId:
      input.locationId !== undefined ? input.locationId : current.locationId,
    packSize: input.packSize !== undefined ? input.packSize : current.packSize,
    batchNo: input.batchNo !== undefined ? input.batchNo : current.batchNo,
    expiryDate:
      input.expiryDate !== undefined ? input.expiryDate : current.expiryDate,
  };

  if (saleMode === "unit") {
    computeUnitPricing({
      bulkQty: next.bulkQty,
      bulkCostPaise: next.bulkCostPaise,
      unitPricePaise: next.unitPricePaise,
    });
  } else {
    computeWeightProfit({
      weightDisplay: 1,
      pricePerDisplayPaise: next.unitPricePaise,
      bulkQtyDisplay: next.bulkQty,
      bulkCostPaise: next.bulkCostPaise,
    });
  }

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE inventory_items SET
        name = ?, sku = ?, qty = ?, unit_price_paise = ?,
        bulk_qty = ?, bulk_cost_paise = ?, location_id = ?,
        pack_size = ?, batch_no = ?, expiry_date = ?,
        sale_mode = ?, weight_unit = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      next.name,
      next.sku,
      next.qty,
      next.unitPricePaise,
      next.bulkQty,
      next.bulkCostPaise,
      next.locationId,
      next.packSize,
      next.batchNo,
      next.expiryDate,
      saleMode,
      weightUnit,
      now,
      id
    );
  return getInventoryItem(id)!;
}

export function deleteInventoryItem(id: string): void {
  const current = getInventoryItem(id);
  if (!current) throw new Error("Item not found");
  const now = new Date().toISOString();
  getDb()
    .prepare(`UPDATE inventory_items SET deleted_at = ?, updated_at = ? WHERE id = ?`)
    .run(now, now, id);
}

export function deductStock(itemId: string, qtyBaseOrPieces: number): InventoryItemDto {
  const item = getInventoryItem(itemId);
  if (!item) throw new Error("Item not found");
  if (qtyBaseOrPieces <= 0) throw new Error("deduct qty must be positive");
  if (item.qty < qtyBaseOrPieces) {
    throw new Error(
      `Insufficient stock: have ${item.qty}, need ${qtyBaseOrPieces}`
    );
  }
  const now = new Date().toISOString();
  getDb()
    .prepare(`UPDATE inventory_items SET qty = qty - ?, updated_at = ? WHERE id = ?`)
    .run(qtyBaseOrPieces, now, itemId);
  return getInventoryItem(itemId)!;
}

export function previewPricing(input: {
  bulkQty: number;
  bulkCostPaise: number;
  unitPricePaise: number;
  sellQty?: number;
  saleMode?: SaleMode;
}): { pricing: PricingBreakdown; projectedProfit: ProjectedProfit } {
  const mode = input.saleMode ?? "unit";
  const n = input.sellQty ?? (mode === "weight" ? 1 : 100);
  if (mode === "weight") {
    const wp = computeWeightProfit({
      weightDisplay: n,
      pricePerDisplayPaise: input.unitPricePaise,
      bulkQtyDisplay: input.bulkQty,
      bulkCostPaise: input.bulkCostPaise,
    });
    return {
      pricing: {
        bulkQty: input.bulkQty,
        bulkCostPaise: input.bulkCostPaise,
        unitPricePaise: input.unitPricePaise,
        costPerUnitPaise: Math.round(wp.costPerDisplayPaiseExact),
        costPerUnitPaiseExact: wp.costPerDisplayPaiseExact,
        profitPerUnitPaise: Math.round(wp.profitPerDisplayPaiseExact),
        profitPerUnitPaiseExact: wp.profitPerDisplayPaiseExact,
      },
      projectedProfit: {
        sellQty: n,
        profitPaise: wp.profitPaise,
        profitPaiseExact: wp.profitPaise,
        revenuePaise: wp.amountPaise,
        costPaise: wp.costPaise,
      },
    };
  }
  const pricing = computeUnitPricing(input);
  const projectedProfit = projectProfit(input, n);
  return { pricing, projectedProfit };
}
