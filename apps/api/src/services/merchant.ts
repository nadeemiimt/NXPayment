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
  auto_confirm_enabled?: number | null;
  android_auto_confirm?: number | null;
  email_auto_confirm?: number | null;
  email_provider?: string | null;
  email_address?: string | null;
  email_secret?: string | null;
  email_connected_at?: string | null;
  single_slot_fifo?: number | null;
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
    autoConfirmEnabled: Boolean(row.auto_confirm_enabled),
    androidAutoConfirm: Boolean(row.android_auto_confirm),
    emailAutoConfirm: Boolean(row.email_auto_confirm),
    emailProvider: (row.email_provider as "gmail" | "yahoo" | "mock" | null) ?? null,
    emailAddress: row.email_address ?? null,
    emailConnected: Boolean(row.email_secret || row.email_provider === "mock"),
    emailConnectedAt: row.email_connected_at ?? null,
    singleSlotFifo: row.single_slot_fifo === undefined || row.single_slot_fifo === null
      ? true
      : Boolean(row.single_slot_fifo),
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
  autoConfirmEnabled?: boolean;
  androidAutoConfirm?: boolean;
  emailAutoConfirm?: boolean;
  singleSlotFifo?: boolean;
}) {
  const current = getMerchantConfig();
  const row = getDb()
    .prepare("SELECT * FROM merchant_config WHERE id = 1")
    .get() as MerchantConfigRow;

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
    auto_confirm_enabled:
      input.autoConfirmEnabled !== undefined
        ? input.autoConfirmEnabled
          ? 1
          : 0
        : row.auto_confirm_enabled ?? 0,
    android_auto_confirm:
      input.androidAutoConfirm !== undefined
        ? input.androidAutoConfirm
          ? 1
          : 0
        : row.android_auto_confirm ?? 0,
    email_auto_confirm:
      input.emailAutoConfirm !== undefined
        ? input.emailAutoConfirm
          ? 1
          : 0
        : row.email_auto_confirm ?? 0,
    single_slot_fifo:
      input.singleSlotFifo !== undefined
        ? input.singleSlotFifo
          ? 1
          : 0
        : row.single_slot_fifo ?? 1,
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
        auto_confirm_enabled = @auto_confirm_enabled,
        android_auto_confirm = @android_auto_confirm,
        email_auto_confirm = @email_auto_confirm,
        single_slot_fifo = @single_slot_fifo,
        updated_at = @updated_at
      WHERE id = 1`
    )
    .run(next);

  return getMerchantConfig();
}

export function connectEmailMailbox(input: {
  provider: "gmail" | "yahoo" | "mock";
  emailAddress: string;
  secret: string;
}) {
  getDb()
    .prepare(
      `UPDATE merchant_config SET
        email_provider = ?,
        email_address = ?,
        email_secret = ?,
        email_connected_at = ?,
        email_auto_confirm = 1,
        auto_confirm_enabled = 1,
        updated_at = ?
      WHERE id = 1`
    )
    .run(
      input.provider,
      input.emailAddress,
      input.secret,
      new Date().toISOString(),
      new Date().toISOString()
    );
  return getMerchantConfig();
}

export function disconnectEmailMailbox() {
  getDb()
    .prepare(
      `UPDATE merchant_config SET
        email_provider = NULL,
        email_address = NULL,
        email_secret = NULL,
        email_connected_at = NULL,
        email_auto_confirm = 0,
        updated_at = ?
      WHERE id = 1`
    )
    .run(new Date().toISOString());
  return getMerchantConfig();
}

/** Internal: secret for IMAP/OAuth — never expose via public config DTO. */
export function getEmailCredentials(): {
  provider: string | null;
  emailAddress: string | null;
  secret: string | null;
} {
  const row = getDb()
    .prepare(
      `SELECT email_provider, email_address, email_secret FROM merchant_config WHERE id = 1`
    )
    .get() as {
    email_provider: string | null;
    email_address: string | null;
    email_secret: string | null;
  };
  return {
    provider: row.email_provider,
    emailAddress: row.email_address,
    secret: row.email_secret,
  };
}

export function resolveReceivingVpa(): { vpa: string; name: string } {
  const m = getMerchantConfig();
  return { vpa: m.primaryVpa, name: m.displayName };
}
