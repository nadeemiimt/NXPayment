import { getDb } from "../db/schema.js";

export type StaffRole = "owner" | "cashier";

export interface StaffSettingsDto {
  role: StaffRole;
  updatedAt: string;
  /** Capabilities derived from role — Slice 2 stub (no login yet). */
  canEditStorageSecrets: boolean;
  canManageShops: boolean;
  canSellAndConfirm: boolean;
}

export function getStaffSettings(): StaffSettingsDto {
  const row = getDb()
    .prepare("SELECT role, updated_at FROM staff_settings WHERE id = 1")
    .get() as { role: string; updated_at: string };
  const role = (row.role === "cashier" ? "cashier" : "owner") as StaffRole;
  return {
    role,
    updatedAt: row.updated_at,
    canEditStorageSecrets: role === "owner",
    canManageShops: role === "owner",
    canSellAndConfirm: true,
  };
}

export function setStaffRole(role: StaffRole): StaffSettingsDto {
  const now = new Date().toISOString();
  getDb()
    .prepare(`UPDATE staff_settings SET role = ?, updated_at = ? WHERE id = 1`)
    .run(role, now);
  return getStaffSettings();
}

export function assertCanEditStorageSecrets(): void {
  const s = getStaffSettings();
  if (!s.canEditStorageSecrets) {
    throw new Error("Cashier role cannot edit storage secrets — switch to owner");
  }
}
