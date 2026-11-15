import { nanoid } from "nanoid";
import { getDb } from "../db/schema.js";
import {
  computeUnitPricing,
  projectProfit,
  type PricingBreakdown,
  type ProjectedProfit,
} from "../lib/pricing.js";
import { getShop } from "./shops.js";

export interface InventoryItemDto {
  id: string;
  shopId: string;
  locationId: string | null;
  locationName: string | null;
  name: string;
  sku: string | null;
  qty: number;
  unitPricePaise: number | null;
  bulkQty: number | null;
  bulkCostPaise: number | null;
  packSize: string | null;
  batchNo: string | null;
  expiryDate: string | null;
  pricing: PricingBreakdown | null;
  /** Default projection for sellQty = min(100, qty) or 100 */
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
  created_at: string;
  updated_at: string;
  location_name?: string | null;
}

function attachPricing(row: ItemRow, projectSellQty?: number): InventoryItemDto {
  let pricing: PricingBreakdown | null = null;
  let projectedProfit: ProjectedProfit | null = null;
  if (
    row.bulk_qty != null &&
    row.bulk_qty > 0 &&
    row.bulk_cost_paise != null &&
    row.unit_price_paise != null
  ) {
    try {
      const input = {
        bulkQty: row.bulk_qty,
        bulkCostPaise: row.bulk_cost_paise,
        unitPricePaise: row.unit_price_paise,
      };
      pricing = computeUnitPricing(input);
      const n =
        projectSellQty ??
        (row.qty > 0 ? Math.min(100, row.qty) : 100);
      projectedProfit = projectProfit(input, n);
    } catch {
      pricing = null;
      projectedProfit = null;
    }
  }

  return {
    id: row.id,
    shopId: row.shop_id,
    locationId: row.location_id,
    locationName: row.location_name ?? null,
    name: row.name,
    sku: row.sku,
    qty: row.qty,
    unitPricePaise: row.unit_price_paise,
    bulkQty: row.bulk_qty,
    bulkCostPaise: row.bulk_cost_paise,
    packSize: row.pack_size,
    batchNo: row.batch_no,
    expiryDate: row.expiry_date,
    pricing,
    projectedProfit,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listInventory(shopId: string): InventoryItemDto[] {
  const rows = getDb()
    .prepare(
      `SELECT i.*, l.name as location_name
       FROM inventory_items i
       LEFT JOIN locations l ON l.id = i.location_id AND l.deleted_at IS NULL
       WHERE i.shop_id = ? AND i.deleted_at IS NULL
       ORDER BY i.name ASC`
    )
    .all(shopId) as ItemRow[];
  return rows.map((r) => attachPricing(r));
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
  unitPricePaise: number;
  bulkQty: number;
  bulkCostPaise: number;
  locationId?: string | null;
  packSize?: string | null;
  batchNo?: string | null;
  expiryDate?: string | null;
}): InventoryItemDto {
  if (!getShop(input.shopId)) throw new Error("Shop not found");
  // Validate pricing up front
  computeUnitPricing({
    bulkQty: input.bulkQty,
    bulkCostPaise: input.bulkCostPaise,
    unitPricePaise: input.unitPricePaise,
  });

  const id = `inv_${nanoid(10)}`;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO inventory_items (
        id, shop_id, location_id, name, sku, qty, unit_price_paise,
        bulk_qty, bulk_cost_paise, pack_size, batch_no, expiry_date,
        created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    )
    .run(
      id,
      input.shopId,
      input.locationId ?? null,
      input.name,
      input.sku ?? null,
      input.qty ?? 0,
      input.unitPricePaise,
      input.bulkQty,
      input.bulkCostPaise,
      input.packSize ?? null,
      input.batchNo ?? null,
      input.expiryDate ?? null,
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
    unitPricePaise?: number;
    bulkQty?: number;
    bulkCostPaise?: number;
    locationId?: string | null;
    packSize?: string | null;
    batchNo?: string | null;
    expiryDate?: string | null;
  }
): InventoryItemDto {
  const current = getInventoryItem(id);
  if (!current) throw new Error("Item not found");

  const next = {
    name: input.name ?? current.name,
    sku: input.sku !== undefined ? input.sku : current.sku,
    qty: input.qty !== undefined ? input.qty : current.qty,
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

  computeUnitPricing({
    bulkQty: next.bulkQty,
    bulkCostPaise: next.bulkCostPaise,
    unitPricePaise: next.unitPricePaise,
  });

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE inventory_items SET
        name = ?, sku = ?, qty = ?, unit_price_paise = ?,
        bulk_qty = ?, bulk_cost_paise = ?, location_id = ?,
        pack_size = ?, batch_no = ?, expiry_date = ?, updated_at = ?
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

export function previewPricing(input: {
  bulkQty: number;
  bulkCostPaise: number;
  unitPricePaise: number;
  sellQty?: number;
}): { pricing: PricingBreakdown; projectedProfit: ProjectedProfit } {
  const pricing = computeUnitPricing(input);
  const projectedProfit = projectProfit(input, input.sellQty ?? 100);
  return { pricing, projectedProfit };
}
