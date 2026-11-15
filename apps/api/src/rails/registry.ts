import { authorizeNetStub, cardPartnerMastercard, cardPartnerVisa } from "./card-stubs.js";
import type { PaymentProvider, RailHealth } from "./types.js";
import { upiDirectRail } from "./upi-direct.js";

export type ProviderId =
  | "upi_direct"
  | "card_partner_visa"
  | "card_partner_mastercard"
  | "authorize_net";

const REGISTRY: Record<ProviderId, PaymentProvider> = {
  upi_direct: upiDirectRail,
  card_partner_visa: cardPartnerVisa,
  card_partner_mastercard: cardPartnerMastercard,
  authorize_net: authorizeNetStub,
};

export function listProviders(): PaymentProvider[] {
  return Object.values(REGISTRY);
}

export function getProvider(id: string): PaymentProvider | null {
  return (REGISTRY as Record<string, PaymentProvider>)[id] ?? null;
}

export function isKnownProvider(id: string): id is ProviderId {
  return id in REGISTRY;
}

export interface ProviderSelectionPolicy {
  upiEnabled: boolean;
  cardsEnabled: boolean;
  otherEnabled: boolean;
  primaryProvider: ProviderId;
  backupProvider: ProviderId | null;
}

export function defaultProviderPolicy(): ProviderSelectionPolicy {
  return {
    upiEnabled: true,
    cardsEnabled: false,
    otherEnabled: false,
    primaryProvider: "upi_direct",
    backupProvider: null,
  };
}

function categoryEnabled(p: PaymentProvider, policy: ProviderSelectionPolicy): boolean {
  if (p.capabilities.category === "upi") return policy.upiEnabled;
  if (p.capabilities.category === "cards") return policy.cardsEnabled;
  return policy.otherEnabled;
}

export function resolveProviderOrder(policy: ProviderSelectionPolicy): PaymentProvider[] {
  const ordered: PaymentProvider[] = [];
  const push = (id: string | null | undefined) => {
    if (!id) return;
    const p = getProvider(id);
    if (!p) return;
    if (!categoryEnabled(p, policy)) return;
    if (ordered.some((x) => x.id === p.id)) return;
    ordered.push(p);
  };

  push(policy.primaryProvider);
  // Backup only when both primary category and backup are enabled / set.
  if (policy.backupProvider && policy.backupProvider !== policy.primaryProvider) {
    push(policy.backupProvider);
  }

  // Sensible default: if nothing selected, UPI when enabled.
  if (ordered.length === 0 && policy.upiEnabled) {
    push("upi_direct");
  }
  return ordered;
}

export class ProviderNotConfiguredError extends Error {
  constructor(
    public readonly providerId: string,
    message: string
  ) {
    super(message);
    this.name = "ProviderNotConfiguredError";
  }
}

export class NoProviderAvailableError extends Error {
  constructor(message = "No payment provider enabled") {
    super(message);
    this.name = "NoProviderAvailableError";
  }
}

/**
 * Pick the first usable provider from merchant policy.
 * Stubs that return notConfigured are skipped when a backup exists.
 */
export async function selectProvider(
  policy: ProviderSelectionPolicy
): Promise<{ provider: PaymentProvider; health: RailHealth }> {
  const order = resolveProviderOrder(policy);
  if (order.length === 0) throw new NoProviderAvailableError();

  let last: { provider: PaymentProvider; health: RailHealth } | null = null;
  for (const provider of order) {
    const health = await provider.healthCheck();
    last = { provider, health };
    if (health === "up" || health === "degraded") {
      return { provider, health };
    }
  }
  // All down / not configured — return first for a clear error at create time.
  return last!;
}
