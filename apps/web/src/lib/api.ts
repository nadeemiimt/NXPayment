const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3847";

export type PaymentStatus =
  | "INITIATED"
  | "ACTIVE"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";

export interface Payment {
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
}

export interface MerchantConfig {
  primaryVpa: string;
  secondaryVpa: string | null;
  displayName: string;
  brandName: string;
  accentColor: string;
  logoUrl: string | null;
  webhookUrl: string | null;
  paymentTtlMs: number;
  updatedAt: string;
}

export interface Tally {
  from: string;
  to: string;
  successCount: number;
  failedCount: number;
  expiredCount: number;
  cancelledCount: number;
  paymentCount: number;
  totalSalesPaise: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message ?? data.error ?? `HTTP ${res.status}`) as Error & {
      status: number;
      body: unknown;
    };
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data as T;
}

export const api = {
  getConfig: () => request<{ config: MerchantConfig }>("/api/merchant/config"),
  updateConfig: (body: Partial<MerchantConfig>) =>
    request<{ config: MerchantConfig }>("/api/merchant/config", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  createPayment: (body: {
    amountPaise: number;
    merchantOrderId?: string;
    note?: string;
    idempotencyKey?: string;
    confirmDuplicate?: boolean;
  }) =>
    request<{ payment: Payment }>("/api/payments", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getPayment: (id: string) => request<{ payment: Payment }>(`/api/payments/${id}`),
  listPayments: (status?: string) =>
    request<{ payments: Payment[] }>(
      `/api/payments${status ? `?status=${status}` : ""}`
    ),
  pending: () => request<{ payments: Payment[] }>("/api/payments/pending"),
  confirm: (id: string) =>
    request<{ payment: Payment }>(`/api/payments/${id}/confirm`, { method: "POST" }),
  reject: (id: string, reason?: string) =>
    request<{ payment: Payment }>(`/api/payments/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  tally: () => request<{ tally: Tally }>("/api/reports/tally"),
  webhooks: () =>
    request<{
      deliveries: Array<{
        id: string;
        paymentId: string;
        event: string;
        status: string;
        createdAt: string;
      }>;
    }>("/api/merchant/webhooks"),
};

export { API_URL };
