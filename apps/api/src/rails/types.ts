export interface PaymentSession {
  id: string;
  amountPaise: number;
  note?: string | null;
  receivingVpa: string;
  receivingName: string;
}

export interface CheckoutPresentation {
  upiUri: string;
  qrPayload: string;
  railId: string;
}

export type RailHealth = "up" | "degraded" | "down";

export interface PaymentRail {
  id: string;
  createCheckout(session: PaymentSession): Promise<CheckoutPresentation>;
  handleWebhook?(raw: unknown): Promise<{ status: string }>;
  healthCheck(): Promise<RailHealth>;
}
