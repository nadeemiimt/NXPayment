export type PaymentStatus =
  | "INITIATED"
  | "ACTIVE"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";

export const TERMINAL_STATUSES: PaymentStatus[] = [
  "SUCCESS",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
];

export const IN_PROGRESS_STATUSES: PaymentStatus[] = [
  "INITIATED",
  "ACTIVE",
  "PROCESSING",
];

export interface MoneyPaise {
  amountPaise: number;
  currency: "INR";
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function formatInr(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paise / 100);
}

/** Build a UPI intent URI targeting the merchant VPA. */
export function buildUpiUri(opts: {
  pa: string;
  pn: string;
  amRupees: string;
  tn?: string;
  tr?: string;
  cu?: string;
}): string {
  const params = new URLSearchParams({
    pa: opts.pa,
    pn: opts.pn,
    am: opts.amRupees,
    cu: opts.cu ?? "INR",
  });
  if (opts.tn) params.set("tn", opts.tn);
  if (opts.tr) params.set("tr", opts.tr);
  return `upi://pay?${params.toString()}`;
}

export interface PaymentDto {
  id: string;
  merchantOrderId: string | null;
  amountPaise: number;
  currency: "INR";
  status: PaymentStatus;
  note: string | null;
  upiUri: string;
  receivingVpa: string;
  receivingName: string;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  confirmedAt: string | null;
  riskScore?: number;
  riskSignals?: Record<string, unknown> | null;
}

export interface TallyReport {
  from: string;
  to: string;
  successCount: number;
  failedCount: number;
  expiredCount: number;
  cancelledCount: number;
  paymentCount: number;
  totalSalesPaise: number;
}

export interface MerchantConfigDto {
  primaryVpa: string;
  secondaryVpa: string | null;
  displayName: string;
  brandName: string;
  accentColor: string;
  logoUrl: string | null;
  webhookUrl: string | null;
  paymentTtlMs: number;
}

/** Extension point — GST export (not implemented in MVP). */
export interface GstExportAdapter {
  exportPeriod(from: string, to: string): Promise<{ stub: true; message: string }>;
}

/** Extension point — bank reconciliation import (not implemented in MVP). */
export interface ReconciliationAdapter {
  importStatement(raw: unknown): Promise<{ stub: true; message: string }>;
}
