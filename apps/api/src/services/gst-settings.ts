import { getDb } from "../db/schema.js";
import type { GstPriceMode, GstSplitMode } from "../lib/money-gst.js";

export interface GstSettingsDto {
  ratePercent: number;
  splitMode: GstSplitMode;
  priceMode: GstPriceMode;
  hsnCode: string | null;
  fyStartMonth: number;
  updatedAt: string;
}

interface GstRow {
  rate_percent: number;
  split_mode: string;
  price_mode: string;
  hsn_code: string | null;
  fy_start_month: number;
  updated_at: string;
}

export function getGstSettings(): GstSettingsDto {
  const row = getDb().prepare("SELECT * FROM gst_settings WHERE id = 1").get() as GstRow;
  return {
    ratePercent: row.rate_percent,
    splitMode: row.split_mode as GstSplitMode,
    priceMode: row.price_mode as GstPriceMode,
    hsnCode: row.hsn_code,
    fyStartMonth: row.fy_start_month,
    updatedAt: row.updated_at,
  };
}

export function updateGstSettings(input: {
  ratePercent?: number;
  splitMode?: GstSplitMode;
  priceMode?: GstPriceMode;
  hsnCode?: string | null;
  fyStartMonth?: number;
}): GstSettingsDto {
  const current = getGstSettings();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE gst_settings SET
        rate_percent = ?, split_mode = ?, price_mode = ?, hsn_code = ?, fy_start_month = ?, updated_at = ?
       WHERE id = 1`
    )
    .run(
      input.ratePercent ?? current.ratePercent,
      input.splitMode ?? current.splitMode,
      input.priceMode ?? current.priceMode,
      input.hsnCode !== undefined ? input.hsnCode : current.hsnCode,
      input.fyStartMonth ?? current.fyStartMonth,
      now
    );
  return getGstSettings();
}
