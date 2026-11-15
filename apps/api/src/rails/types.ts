export interface PaymentSession {
  id: string;
  amountPaise: number;
  note?: string | null;
  receivingVpa: string;
  receivingName: string;
}

export interface CheckoutPresentation {
  upiUri: string | null;
  qrPayload: string | null;
  deepLinks: Record<string, string>;
  railId: string;
  provider: string;
  /** Present when the provider cannot create a live checkout. */
  notConfigured?: boolean;
  message?: string;
}

export type RailHealth = "up" | "degraded" | "down" | "not_configured";

export interface ProviderCapabilities {
  create: boolean;
  status: boolean;
  refund: boolean;
  /** Human-facing category for simple merchant UI. */
  category: "upi" | "cards" | "other";
  label: string;
}

export interface ProviderStatus {
  status: string;
  provider: string;
  raw?: unknown;
  notConfigured?: boolean;
  message?: string;
}

/**
 * Pluggable payment provider (rail).
 * UPI direct is the default; card / Authorize.net stubs stay not-configured.
 */
export interface PaymentProvider {
  id: string;
  capabilities: ProviderCapabilities;
  createPayment(session: PaymentSession): Promise<CheckoutPresentation>;
  getStatus(paymentId: string): Promise<ProviderStatus>;
  refund?(paymentId: string, amountPaise?: number): Promise<{ ok: boolean; message: string }>;
  healthCheck(): Promise<RailHealth>;
}

/** @deprecated Prefer PaymentProvider — kept for older imports. */
export type PaymentRail = PaymentProvider & {
  createCheckout(session: PaymentSession): Promise<CheckoutPresentation>;
};
