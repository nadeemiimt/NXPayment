import type {
  CheckoutPresentation,
  PaymentProvider,
  PaymentSession,
  ProviderStatus,
  RailHealth,
} from "./types.js";

function notConfiguredStub(opts: {
  id: string;
  category: "cards" | "other";
  label: string;
}): PaymentProvider {
  const message = `${opts.id} is not configured — partner acquiring required (stub only)`;
  return {
    id: opts.id,
    capabilities: {
      create: false,
      status: false,
      refund: false,
      category: opts.category,
      label: opts.label,
    },
    async createPayment(_session: PaymentSession): Promise<CheckoutPresentation> {
      return {
        upiUri: null,
        qrPayload: null,
        deepLinks: {},
        railId: opts.id,
        provider: opts.id,
        notConfigured: true,
        message,
      };
    },
    async getStatus(_paymentId: string): Promise<ProviderStatus> {
      return {
        status: "not_configured",
        provider: opts.id,
        notConfigured: true,
        message,
      };
    },
    async refund() {
      return { ok: false, message };
    },
    async healthCheck(): Promise<RailHealth> {
      return "not_configured";
    },
  };
}

export const cardPartnerVisa = notConfiguredStub({
  id: "card_partner_visa",
  category: "cards",
  label: "Visa (partner)",
});

export const cardPartnerMastercard = notConfiguredStub({
  id: "card_partner_mastercard",
  category: "cards",
  label: "Mastercard (partner)",
});

export const authorizeNetStub = notConfiguredStub({
  id: "authorize_net",
  category: "other",
  label: "Authorize.net",
});

/** Legacy ids used by older /api/rails responses. */
export const visaPartnerRail = cardPartnerVisa;
export const mastercardPartnerRail = cardPartnerMastercard;
