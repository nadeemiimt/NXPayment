import { buildUpiUri, paiseToRupees } from "../../../../packages/shared/src/index.ts";
import type { CheckoutPresentation, PaymentRail, PaymentSession, RailHealth } from "./types.js";

export const upiDirectRail: PaymentRail = {
  id: "upi_direct",
  async createCheckout(session: PaymentSession): Promise<CheckoutPresentation> {
    const am = paiseToRupees(session.amountPaise).toFixed(2);
    const upiUri = buildUpiUri({
      pa: session.receivingVpa,
      pn: session.receivingName,
      amRupees: am,
      tn: session.note ?? `NXPayment ${session.id.slice(0, 8)}`,
      tr: session.id,
    });
    return { upiUri, qrPayload: upiUri, railId: this.id };
  },
  async healthCheck(): Promise<RailHealth> {
    return "up";
  },
};
