import { buildUpiUri, paiseToRupees } from "@nxpayment/shared";
import { buildUpiDeepLinks } from "./deep-links.js";
import type {
  CheckoutPresentation,
  PaymentProvider,
  PaymentSession,
  ProviderStatus,
  RailHealth,
} from "./types.js";

export const upiDirectRail: PaymentProvider = {
  id: "upi_direct",
  capabilities: {
    create: true,
    status: true,
    refund: false,
    category: "upi",
    label: "UPI (direct to your VPA)",
  },
  async createPayment(session: PaymentSession): Promise<CheckoutPresentation> {
    const am = paiseToRupees(session.amountPaise).toFixed(2);
    const upiUri = buildUpiUri({
      pa: session.receivingVpa,
      pn: session.receivingName,
      amRupees: am,
      tn: session.note ?? `NXPayment ${session.id.slice(0, 8)}`,
      tr: session.id,
    });
    return {
      upiUri,
      qrPayload: upiUri,
      deepLinks: buildUpiDeepLinks(upiUri),
      railId: this.id,
      provider: this.id,
    };
  },
  async getStatus(paymentId: string): Promise<ProviderStatus> {
    // Status lives in NXPayment DB (merchant Confirm / expiry) — not a PSP poll.
    return {
      status: "tracked_locally",
      provider: this.id,
      raw: { paymentId },
    };
  },
  async healthCheck(): Promise<RailHealth> {
    return "up";
  },
};
