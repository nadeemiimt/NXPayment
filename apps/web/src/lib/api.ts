/**
 * Browser calls use same-origin `/api/...` (Next rewrite → Fastify).
 * Server-side code can still hit the API origin directly.
 */
const SERVER_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3847";

function apiBase(): string {
  if (typeof window !== "undefined") return "";
  return SERVER_API_URL;
}

export type PaymentStatus =
  | "INITIATED"
  | "ACTIVE"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";

export type PaymentMethod = "upi" | "cash" | "card_counter";

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
  riskScore?: number;
  method?: PaymentMethod;
  railId?: string;
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
  autoConfirmEnabled?: boolean;
  androidAutoConfirm?: boolean;
  emailAutoConfirm?: boolean;
  emailConnected?: boolean;
  emailProvider?: string | null;
  emailAddress?: string | null;
  emailConnectedAt?: string | null;
  singleSlotFifo?: boolean;
  hideNxChrome?: boolean;
  whatsappOtpEnabled?: boolean;
  whatsappOtpPhone?: string | null;
  whatsappVerifiedAt?: string | null;
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

function formatApiError(status: number, data: Record<string, unknown>): string {
  if (typeof data.message === "string" && data.message) return data.message;
  if (data.error === "invalid_body" && data.details && typeof data.details === "object") {
    const fieldErrors = (data.details as { fieldErrors?: Record<string, string[]> })
      .fieldErrors;
    if (fieldErrors) {
      const parts = Object.entries(fieldErrors)
        .filter(([, msgs]) => msgs?.length)
        .map(([field, msgs]) => `${field}: ${msgs.join(", ")}`);
      if (parts.length) return parts.join("; ");
    }
  }
  if (typeof data.error === "string" && data.error) return data.error;
  return `HTTP ${status}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };
  let body = init?.body;
  // Fastify rejects Content-Type: application/json with an empty body.
  if (body !== undefined && body !== null) {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
  } else if (method === "POST" || method === "PUT" || method === "PATCH") {
    headers["Content-Type"] = "application/json";
    body = "{}";
  }

  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      ...init,
      method,
      headers,
      body,
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Cannot reach the API. Is it running? Try npm run dev:up (API http://127.0.0.1:3847)."
    );
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    let message = formatApiError(res.status, data);
    if (res.status >= 500 && (!data.error || Object.keys(data).length === 0)) {
      message = `API unavailable (HTTP ${res.status}). Start it with npm run dev:up.`;
    }
    const err = new Error(message) as Error & {
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
    request<{ payment: Payment }>(`/api/payments/${id}/confirm`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  reject: (id: string, reason?: string) =>
    request<{ payment: Payment }>(`/api/payments/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(reason ? { reason } : {}),
    }),
  cancel: (id: string) =>
    request<{ payment: Payment }>(`/api/payments/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({}),
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
  creditEmailStatus: () =>
    request<{
      autoConfirmEnabled: boolean;
      androidAutoConfirm: boolean;
      emailAutoConfirm: boolean;
      emailConnected: boolean;
      emailProvider: string | null;
      emailAddress: string | null;
      gmailOAuthConfigured: boolean;
      yahooOAuthConfigured: boolean;
      gmailRedirectUri?: string;
      primaryVerification: string;
    }>("/api/credits/email/status"),
  updateCreditSettings: (body: {
    autoConfirmEnabled?: boolean;
    androidAutoConfirm?: boolean;
    emailAutoConfirm?: boolean;
  }) =>
    request<{ config: MerchantConfig }>("/api/credits/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  connectEmail: (body: {
    provider: "gmail" | "yahoo" | "mock";
    emailAddress: string;
    secret: string;
  }) =>
    request<{ config: MerchantConfig; note?: string }>("/api/credits/email/connect", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  disconnectEmail: () =>
    request<{ config: MerchantConfig }>("/api/credits/email/disconnect", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  ingestEmailSample: (body: {
    subject: string;
    body: string;
    from?: string;
    poll?: boolean;
  }) =>
    request<{
      poll: { scanned: number; confirmed: number; skipped: number };
    }>("/api/credits/email/ingest", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  observeCredit: (body: {
    amountPaise?: number;
    utr?: string;
    rawText?: string;
    subject?: string;
    source:
      | "android_notification"
      | "sms"
      | "email_gmail"
      | "email_yahoo"
      | "email_mock"
      | "manual";
  }) => request<Record<string, unknown>>("/api/credits/observe", {
    method: "POST",
    body: JSON.stringify(body),
  }),
  listAlerts: (opts?: { unreadOnly?: boolean }) =>
    request<{
      alerts: Array<Record<string, unknown>>;
      unreadCount: number;
    }>(`/api/alerts${opts?.unreadOnly ? "?unreadOnly=1" : ""}`),
  markAlertRead: (id: string) =>
    request<{ ok: boolean; unreadCount: number }>(`/api/alerts/${id}/read`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  dismissAlert: (id: string) =>
    request<{ ok: boolean; unreadCount: number }>(`/api/alerts/${id}/dismiss`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  markAllAlertsRead: () =>
    request<{ ok: boolean; updated: number; unreadCount: number }>(
      "/api/alerts/read-all",
      { method: "POST", body: JSON.stringify({}) }
    ),
  whatsappOtpStatus: () =>
    request<{
      configured: boolean;
      mode: "stub" | "meta_cloud";
      templateName: string;
      gateEnabled: boolean;
      gatePhone: string | null;
      onboardingVerifiedAt: string | null;
    }>("/api/otp/whatsapp/status"),
  sendWhatsAppOtp: (body: {
    phoneE164: string;
    purpose: "checkout_gate" | "onboarding_gate";
  }) =>
    request<{
      ok: boolean;
      mode: "stub" | "meta_cloud";
      challengeId: string;
      expiresAt: string;
      stubCode?: string;
      detail: string;
    }>("/api/otp/whatsapp/send", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  verifyWhatsAppOtp: (body: { challengeId: string; code: string }) =>
    request<{ ok: boolean; purpose?: string; detail: string }>(
      "/api/otp/whatsapp/verify",
      { method: "POST", body: JSON.stringify(body) }
    ),
  createTillSale: (body: {
    amountPaise: number;
    method: "cash" | "card_counter";
    merchantOrderId?: string;
    note?: string;
    confirm?: boolean;
  }) =>
    request<{ payment: Payment }>("/api/till/sales", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listOpenTill: () => request<{ payments: Payment[] }>("/api/till/open"),
  confirmTillSale: (id: string) =>
    request<{ payment: Payment }>(`/api/till/sales/${id}/confirm`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
};

export { SERVER_API_URL as API_URL };
