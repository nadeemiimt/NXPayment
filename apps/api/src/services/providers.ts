import { getDb } from "../db/schema.js";
import {
  defaultProviderPolicy,
  isKnownProvider,
  listProviders,
  type ProviderId,
  type ProviderSelectionPolicy,
  selectProvider,
} from "../rails/registry.js";

interface ProviderSettingsRow {
  id: number;
  upi_enabled: number;
  cards_enabled: number;
  other_enabled: number;
  primary_provider: string;
  backup_provider: string | null;
  agents_enabled: number;
  updated_at: string;
}

export interface ProviderSettingsDto {
  upiEnabled: boolean;
  cardsEnabled: boolean;
  otherEnabled: boolean;
  primaryProvider: ProviderId;
  backupProvider: ProviderId | null;
  agentsEnabled: boolean;
  updatedAt: string;
  /** Simple merchant-facing summary — no control-panel maze. */
  summary: {
    primaryLabel: string;
    backupLabel: string | null;
    cardsComingSoon: boolean;
  };
  providers: Array<{
    id: string;
    label: string;
    category: string;
    configured: boolean;
  }>;
}

function ensureRow(): ProviderSettingsRow {
  const db = getDb();
  let row = db.prepare("SELECT * FROM provider_settings WHERE id = 1").get() as
    | ProviderSettingsRow
    | undefined;
  if (!row) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO provider_settings (
        id, upi_enabled, cards_enabled, other_enabled,
        primary_provider, backup_provider, agents_enabled, updated_at
      ) VALUES (1, 1, 0, 0, 'upi_direct', NULL, 0, ?)`
    ).run(now);
    row = db.prepare("SELECT * FROM provider_settings WHERE id = 1").get() as ProviderSettingsRow;
  }
  return row;
}

function toPolicy(row: ProviderSettingsRow): ProviderSelectionPolicy {
  const primary = isKnownProvider(row.primary_provider)
    ? row.primary_provider
    : "upi_direct";
  const backup =
    row.backup_provider && isKnownProvider(row.backup_provider)
      ? row.backup_provider
      : null;
  return {
    upiEnabled: row.upi_enabled === 1,
    cardsEnabled: row.cards_enabled === 1,
    otherEnabled: row.other_enabled === 1,
    primaryProvider: primary,
    backupProvider: backup,
  };
}

function toDto(row: ProviderSettingsRow): ProviderSettingsDto {
  const policy = toPolicy(row);
  const providers = listProviders().map((p) => ({
    id: p.id,
    label: p.capabilities.label,
    category: p.capabilities.category,
    configured: p.capabilities.create,
  }));
  const primary = listProviders().find((p) => p.id === policy.primaryProvider);
  const backup = policy.backupProvider
    ? listProviders().find((p) => p.id === policy.backupProvider)
    : null;
  return {
    upiEnabled: policy.upiEnabled,
    cardsEnabled: policy.cardsEnabled,
    otherEnabled: policy.otherEnabled,
    primaryProvider: policy.primaryProvider,
    backupProvider: policy.backupProvider,
    agentsEnabled: row.agents_enabled === 1,
    updatedAt: row.updated_at,
    summary: {
      primaryLabel: primary?.capabilities.label ?? "UPI",
      backupLabel: backup?.capabilities.label ?? null,
      cardsComingSoon: !policy.cardsEnabled,
    },
    providers,
  };
}

export function getProviderSettings(): ProviderSettingsDto {
  return toDto(ensureRow());
}

export function getProviderPolicy(): ProviderSelectionPolicy {
  return toPolicy(ensureRow());
}

export function updateProviderSettings(input: {
  upiEnabled?: boolean;
  cardsEnabled?: boolean;
  otherEnabled?: boolean;
  primaryProvider?: string;
  backupProvider?: string | null;
  agentsEnabled?: boolean;
}): ProviderSettingsDto {
  const current = ensureRow();
  const next = {
    upi_enabled:
      input.upiEnabled !== undefined ? (input.upiEnabled ? 1 : 0) : current.upi_enabled,
    cards_enabled:
      input.cardsEnabled !== undefined ? (input.cardsEnabled ? 1 : 0) : current.cards_enabled,
    other_enabled:
      input.otherEnabled !== undefined ? (input.otherEnabled ? 1 : 0) : current.other_enabled,
    primary_provider:
      input.primaryProvider && isKnownProvider(input.primaryProvider)
        ? input.primaryProvider
        : current.primary_provider,
    backup_provider:
      input.backupProvider === null
        ? null
        : input.backupProvider && isKnownProvider(input.backupProvider)
          ? input.backupProvider
          : current.backup_provider,
    agents_enabled:
      input.agentsEnabled !== undefined
        ? input.agentsEnabled
          ? 1
          : 0
        : current.agents_enabled,
  };

  // Sensible defaults: UPI stays primary when enabled; clear backup if same as primary.
  if (next.upi_enabled === 1 && !isKnownProvider(next.primary_provider)) {
    next.primary_provider = "upi_direct";
  }
  if (next.upi_enabled === 1 && next.primary_provider !== "upi_direct" && !next.other_enabled) {
    // Keep shops on UPI unless they explicitly opened Advanced (other).
    if (next.cards_enabled !== 1) next.primary_provider = "upi_direct";
  }
  if (next.backup_provider === next.primary_provider) {
    next.backup_provider = null;
  }
  // Only allow backup when at least two categories could apply.
  const enabledCount =
    (next.upi_enabled ? 1 : 0) + (next.cards_enabled ? 1 : 0) + (next.other_enabled ? 1 : 0);
  if (enabledCount < 2) {
    next.backup_provider = null;
  }

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE provider_settings SET
        upi_enabled = @upi_enabled,
        cards_enabled = @cards_enabled,
        other_enabled = @other_enabled,
        primary_provider = @primary_provider,
        backup_provider = @backup_provider,
        agents_enabled = @agents_enabled,
        updated_at = @updated_at
       WHERE id = 1`
    )
    .run({ ...next, updated_at: now });

  return getProviderSettings();
}

export async function pickCheckoutProvider() {
  const policy = getProviderPolicy();
  // Fall back to defaults if somehow empty.
  return selectProvider(policy.upiEnabled || policy.cardsEnabled || policy.otherEnabled
    ? policy
    : defaultProviderPolicy());
}
