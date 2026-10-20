import { config } from "../config.js";
import { getDb } from "../db/schema.js";

export interface MerchantConfigRow {
  primary_vpa: string;
  secondary_vpa: string | null;
  display_name: string;
  brand_name: string;
  accent_color: string;
  logo_url: string | null;
  webhook_url: string | null;
  webhook_secret: string;
  updated_at: string;
  payment_ttl_ms?: number;
}

export function getMerchantConfig() {
  const row = getDb()
    .prepare("SELECT * FROM merchant_config WHERE id = 1")
    .get() as MerchantConfigRow;
  return {
    primaryVpa: row.primary_vpa,
    secondaryVpa: row.secondary_vpa,
    displayName: row.display_name,
    brandName: row.brand_name,
    accentColor: row.accent_color,
    logoUrl: row.logo_url,
    webhookUrl: row.webhook_url,
    webhookSecret: row.webhook_secret,
    paymentTtlMs: config.paymentTtlMs,
    updatedAt: row.updated_at,
  };
}

export function updateMerchantConfig(input: {
  primaryVpa?: string;
  secondaryVpa?: string | null;
  displayName?: string;
  brandName?: string;
  accentColor?: string;
  logoUrl?: string | null;
  webhookUrl?: string | null;
}) {
  const current = getMerchantConfig();
  const next = {
    primary_vpa: input.primaryVpa ?? current.primaryVpa,
    secondary_vpa:
      input.secondaryVpa !== undefined ? input.secondaryVpa : current.secondaryVpa,
    display_name: input.displayName ?? current.displayName,
    brand_name: input.brandName ?? current.brandName,
    accent_color: input.accentColor ?? current.accentColor,
    logo_url: input.logoUrl !== undefined ? input.logoUrl : current.logoUrl,
    webhook_url:
      input.webhookUrl !== undefined ? input.webhookUrl : current.webhookUrl,
    updated_at: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `UPDATE merchant_config SET
        primary_vpa = @primary_vpa,
        secondary_vpa = @secondary_vpa,
        display_name = @display_name,
        brand_name = @brand_name,
        accent_color = @accent_color,
        logo_url = @logo_url,
        webhook_url = @webhook_url,
        updated_at = @updated_at
      WHERE id = 1`
    )
    .run(next);

  return getMerchantConfig();
}

export function resolveReceivingVpa(): { vpa: string; name: string } {
  const m = getMerchantConfig();
  return { vpa: m.primaryVpa, name: m.displayName };
}
