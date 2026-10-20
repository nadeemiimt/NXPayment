import type { CheckoutPresentation, PaymentRail, PaymentSession, RailHealth } from "./types.js";

function stubRail(id: string): PaymentRail {
  return {
    id,
    async createCheckout(_session: PaymentSession): Promise<CheckoutPresentation> {
      throw new Error(`${id} is not enabled — card acquiring requires a partner (stub only)`);
    },
    async healthCheck(): Promise<RailHealth> {
      return "down";
    },
  };
}

export const visaPartnerRail = stubRail("visa_partner");
export const mastercardPartnerRail = stubRail("mastercard_partner");

export const rails = {
  upi_direct: null as unknown as PaymentRail, // filled by registry
  visa_partner: visaPartnerRail,
  mastercard_partner: mastercardPartnerRail,
};
