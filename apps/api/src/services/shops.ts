import { nanoid } from "nanoid";
import { getDb } from "../db/schema.js";

export type BusinessType = "retail" | "restaurant" | "pharmacy";

export interface ShopDto {
  id: string;
  name: string;
  businessType: BusinessType;
  vpaOverride: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ShopRow {
  id: string;
  name: string;
  business_type: string;
  vpa_override: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function toDto(row: ShopRow): ShopDto {
  return {
    id: row.id,
    name: row.name,
    businessType: (row.business_type || "retail") as BusinessType,
    vpaOverride: row.vpa_override,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listShops(): ShopDto[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM shops WHERE deleted_at IS NULL ORDER BY is_active DESC, name ASC`
    )
    .all() as ShopRow[];
  return rows.map(toDto);
}

export function getShop(id: string): ShopDto | null {
  const row = getDb()
    .prepare(`SELECT * FROM shops WHERE id = ? AND deleted_at IS NULL`)
    .get(id) as ShopRow | undefined;
  return row ? toDto(row) : null;
}

export function getActiveShop(): ShopDto | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM shops WHERE is_active = 1 AND deleted_at IS NULL LIMIT 1`
    )
    .get() as ShopRow | undefined;
  return row ? toDto(row) : null;
}

export function createShop(input: {
  name: string;
  businessType?: BusinessType;
  vpaOverride?: string | null;
}): ShopDto {
  const id = `shop_${nanoid(10)}`;
  const now = new Date().toISOString();
  const existing = listShops();
  const makeActive = existing.length === 0;
  getDb()
    .prepare(
      `INSERT INTO shops (id, name, business_type, vpa_override, is_active, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`
    )
    .run(
      id,
      input.name,
      input.businessType ?? "retail",
      input.vpaOverride ?? null,
      makeActive ? 1 : 0,
      now,
      now
    );
  return getShop(id)!;
}

export function updateShop(
  id: string,
  input: {
    name?: string;
    businessType?: BusinessType;
    vpaOverride?: string | null;
  }
): ShopDto {
  const current = getShop(id);
  if (!current) throw new Error("Shop not found");
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE shops SET name = ?, business_type = ?, vpa_override = ?, updated_at = ? WHERE id = ?`
    )
    .run(
      input.name ?? current.name,
      input.businessType ?? current.businessType,
      input.vpaOverride !== undefined ? input.vpaOverride : current.vpaOverride,
      now,
      id
    );
  return getShop(id)!;
}

export function setActiveShop(id: string): ShopDto {
  const shop = getShop(id);
  if (!shop) throw new Error("Shop not found");
  const now = new Date().toISOString();
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE shops SET is_active = 0, updated_at = ? WHERE deleted_at IS NULL`).run(
      now
    );
    db.prepare(`UPDATE shops SET is_active = 1, updated_at = ? WHERE id = ?`).run(now, id);
  });
  tx();
  return getShop(id)!;
}

export function deleteShop(id: string): void {
  const shop = getShop(id);
  if (!shop) throw new Error("Shop not found");
  const others = listShops().filter((s) => s.id !== id);
  if (others.length === 0) throw new Error("Cannot delete the last shop");
  const now = new Date().toISOString();
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE shops SET deleted_at = ?, is_active = 0, updated_at = ? WHERE id = ?`).run(
      now,
      now,
      id
    );
    db.prepare(
      `UPDATE locations SET deleted_at = ?, updated_at = ? WHERE shop_id = ? AND deleted_at IS NULL`
    ).run(now, now, id);
    db.prepare(
      `UPDATE inventory_items SET deleted_at = ?, updated_at = ? WHERE shop_id = ? AND deleted_at IS NULL`
    ).run(now, now, id);
    if (shop.isActive) {
      db.prepare(`UPDATE shops SET is_active = 1, updated_at = ? WHERE id = ?`).run(
        now,
        others[0]!.id
      );
    }
  });
  tx();
}

export interface LocationDto {
  id: string;
  shopId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface LocationRow {
  id: string;
  shop_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function locDto(row: LocationRow): LocationDto {
  return {
    id: row.id,
    shopId: row.shop_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listLocations(shopId: string): LocationDto[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM locations WHERE shop_id = ? AND deleted_at IS NULL ORDER BY name ASC`
    )
    .all(shopId) as LocationRow[];
  return rows.map(locDto);
}

export function createLocation(shopId: string, name: string): LocationDto {
  if (!getShop(shopId)) throw new Error("Shop not found");
  const id = `loc_${nanoid(10)}`;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO locations (id, shop_id, name, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, NULL)`
    )
    .run(id, shopId, name, now, now);
  return listLocations(shopId).find((l) => l.id === id)!;
}

export function updateLocation(id: string, name: string): LocationDto {
  const row = getDb()
    .prepare(`SELECT * FROM locations WHERE id = ? AND deleted_at IS NULL`)
    .get(id) as LocationRow | undefined;
  if (!row) throw new Error("Location not found");
  const now = new Date().toISOString();
  getDb()
    .prepare(`UPDATE locations SET name = ?, updated_at = ? WHERE id = ?`)
    .run(name, now, id);
  return locDto({ ...row, name, updated_at: now });
}

export function deleteLocation(id: string): void {
  const row = getDb()
    .prepare(`SELECT * FROM locations WHERE id = ? AND deleted_at IS NULL`)
    .get(id) as LocationRow | undefined;
  if (!row) throw new Error("Location not found");
  const now = new Date().toISOString();
  getDb()
    .prepare(`UPDATE locations SET deleted_at = ?, updated_at = ? WHERE id = ?`)
    .run(now, now, id);
  getDb()
    .prepare(
      `UPDATE inventory_items SET location_id = NULL, updated_at = ? WHERE location_id = ? AND deleted_at IS NULL`
    )
    .run(now, id);
}
