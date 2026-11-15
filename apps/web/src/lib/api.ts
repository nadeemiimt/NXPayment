const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3847";

export type PaymentStatus =
  | "INITIATED"
  | "ACTIVE"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";

export type BusinessType = "retail" | "restaurant" | "pharmacy";
export type StorageMode = "local_only" | "local_replica" | "hybrid" | "online_primary";

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

export interface Shop {
  id: string;
  name: string;
  businessType: BusinessType;
  vpaOverride: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Location {
  id: string;
  shopId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface PricingBreakdown {
  bulkQty: number;
  bulkCostPaise: number;
  unitPricePaise: number;
  costPerUnitPaise: number;
  costPerUnitPaiseExact: number;
  profitPerUnitPaise: number;
  profitPerUnitPaiseExact: number;
}

export interface ProjectedProfit {
  sellQty: number;
  profitPaise: number;
  profitPaiseExact: number;
  revenuePaise: number;
  costPaise: number;
}

export interface InventoryItem {
  id: string;
  shopId: string;
  locationId: string | null;
  locationName: string | null;
  name: string;
  sku: string | null;
  qty: number;
  unitPricePaise: number | null;
  bulkQty: number | null;
  bulkCostPaise: number | null;
  packSize: string | null;
  batchNo: string | null;
  expiryDate: string | null;
  pricing: PricingBreakdown | null;
  projectedProfit: ProjectedProfit | null;
  createdAt: string;
  updatedAt: string;
}

export interface StorageSettings {
  mode: StorageMode;
  secondaryPath: string | null;
  onlinePrimaryEnabled: boolean;
  onlineConnectionConfigured: boolean;
  onlinePrimaryStatus: string;
  primaryPath: string;
  primaryExists: boolean;
  primarySizeBytes: number | null;
  lastBackupAt: string | null;
  lastBackupError: string | null;
  updatedAt: string;
  sliceNote: string | null;
}

export interface GstSettings {
  ratePercent: number;
  splitMode: "cgst_sgst" | "igst";
  priceMode: "inclusive" | "exclusive";
  hsnCode: string | null;
  fyStartMonth: number;
  updatedAt: string;
}

export interface ReportTotals {
  from: string;
  to: string;
  period: string;
  label: string;
  shopId: string | null;
  successCount: number;
  failedCount: number;
  expiredCount: number;
  cancelledCount: number;
  paymentCount: number;
  totalSalesPaise: number;
  avgTicketPaise: number;
  gstCollectedPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxablePaise: number;
  refundsPaise: number;
}

export interface ChartPoint {
  key: string;
  label: string;
  value: number;
  secondary?: number;
}

export interface DisplaySession {
  code: string;
  shopId: string | null;
  label: string | null;
  createdAt: string;
  updatedAt: string;
  urlPath: string;
}

export interface DisplayState {
  code: string;
  merchantName: string;
  brandName: string;
  shopName: string | null;
  status: "idle" | "waiting" | "paid" | "expired" | "failed";
  amountPaise: number | null;
  payment: Payment | null;
  updatedAt: string;
}

export interface Insights {
  from: string;
  to: string;
  shopId: string | null;
  patterns: Array<{ id: string; title: string; detail: string; metric?: string }>;
  recommendations: Array<{
    id: string;
    kind: "focus" | "deprioritize";
    title: string;
    reason: string;
    source: "heuristic" | "llm";
  }>;
  llmEnabled: boolean;
  llmUsed: boolean;
  note: string;
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
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/csv")) {
    const text = await res.text();
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
    return text as T;
  }
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
    shopId?: string;
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
  tally: (shopId?: string | null) =>
    request<{ tally: Tally }>(
      `/api/reports/tally${shopId ? `?shopId=${encodeURIComponent(shopId)}` : ""}`
    ),
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

  getStorage: () => request<{ storage: StorageSettings }>("/api/merchant/storage"),
  updateStorage: (body: {
    mode?: StorageMode;
    secondaryPath?: string | null;
    onlinePrimaryEnabled?: boolean;
    onlineConnectionString?: string | null;
  }) =>
    request<{ storage: StorageSettings }>("/api/merchant/storage", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  runBackup: () =>
    request<{
      backup: { ok: boolean; copiedTo: string | null; error: string | null };
      storage: StorageSettings;
    }>("/api/merchant/storage/backup", { method: "POST" }),

  listShops: () =>
    request<{ shops: Shop[]; activeShopId: string | null }>("/api/merchant/shops"),
  createShop: (body: {
    name: string;
    businessType?: BusinessType;
    vpaOverride?: string | null;
  }) =>
    request<{ shop: Shop }>("/api/merchant/shops", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateShop: (
    id: string,
    body: { name?: string; businessType?: BusinessType; vpaOverride?: string | null }
  ) =>
    request<{ shop: Shop }>(`/api/merchant/shops/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  activateShop: (id: string) =>
    request<{ shop: Shop }>(`/api/merchant/shops/${id}/activate`, { method: "POST" }),
  deleteShop: (id: string) =>
    request<{ ok: boolean; shops: Shop[]; activeShopId: string | null }>(
      `/api/merchant/shops/${id}`,
      { method: "DELETE" }
    ),

  listLocations: (shopId?: string) =>
    request<{ locations: Location[]; shopId: string }>(
      `/api/merchant/locations${shopId ? `?shopId=${encodeURIComponent(shopId)}` : ""}`
    ),
  createLocation: (body: { name: string; shopId?: string }) =>
    request<{ location: Location }>("/api/merchant/locations", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteLocation: (id: string) =>
    request<{ ok: boolean }>(`/api/merchant/locations/${id}`, { method: "DELETE" }),

  listInventory: (shopId?: string) =>
    request<{ items: InventoryItem[]; shopId: string }>(
      `/api/merchant/inventory${shopId ? `?shopId=${encodeURIComponent(shopId)}` : ""}`
    ),
  createInventory: (body: Record<string, unknown>) =>
    request<{ item: InventoryItem }>("/api/merchant/inventory", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateInventory: (id: string, body: Record<string, unknown>) =>
    request<{ item: InventoryItem }>(`/api/merchant/inventory/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteInventory: (id: string) =>
    request<{ ok: boolean }>(`/api/merchant/inventory/${id}`, { method: "DELETE" }),
  previewPricing: (body: {
    bulkQty: number;
    bulkCostPaise: number;
    unitPricePaise: number;
    sellQty?: number;
  }) =>
    request<{ pricing: PricingBreakdown; projectedProfit: ProjectedProfit }>(
      "/api/merchant/inventory/preview-pricing",
      { method: "POST", body: JSON.stringify(body) }
    ),

  getGst: () => request<{ gst: GstSettings }>("/api/merchant/gst-settings"),
  updateGst: (body: Partial<GstSettings>) =>
    request<{ gst: GstSettings }>("/api/merchant/gst-settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  reports: (q: {
    period?: string;
    date?: string;
    year?: number;
    month?: number;
    shopId?: string | null;
  }) => {
    const params = new URLSearchParams();
    if (q.period) params.set("period", q.period);
    if (q.date) params.set("date", q.date);
    if (q.year) params.set("year", String(q.year));
    if (q.month) params.set("month", String(q.month));
    if (q.shopId) params.set("shopId", q.shopId);
    return request<{
      totals: ReportTotals;
      charts: {
        byDayOfWeek: ChartPoint[];
        byHour: ChartPoint[];
        successTrend: ChartPoint[];
      };
      gst: GstSettings;
    }>(`/api/merchant/reports?${params}`);
  },
  reportsCsvUrl: (q: { period?: string; date?: string; shopId?: string | null }) => {
    const params = new URLSearchParams();
    if (q.period) params.set("period", q.period);
    if (q.date) params.set("date", q.date);
    if (q.shopId) params.set("shopId", q.shopId);
    return `${API_URL}/api/merchant/reports/csv?${params}`;
  },

  insights: (shopId?: string | null) =>
    request<{ insights: Insights }>(
      `/api/merchant/insights${shopId ? `?shopId=${encodeURIComponent(shopId)}` : ""}`
    ),

  listDisplaySessions: () =>
    request<{ sessions: DisplaySession[] }>("/api/merchant/display-sessions"),
  createDisplaySession: (body?: { shopId?: string | null; label?: string | null }) =>
    request<{ session: DisplaySession }>("/api/merchant/display-sessions", {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  getDisplay: (code: string) =>
    request<{ display: DisplayState }>(`/api/display/${encodeURIComponent(code)}`),

  getReceiptSettings: () =>
    request<{ receipt: ReceiptSettings }>("/api/merchant/receipt-settings"),
  updateReceiptSettings: (body: Partial<ReceiptSettings>) =>
    request<{ receipt: ReceiptSettings }>("/api/merchant/receipt-settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  getReceipt: (paymentId: string) =>
    request<{ receipt: Receipt }>(`/api/merchant/payments/${paymentId}/receipt`),
  escposDownloadUrl: (paymentId: string) =>
    `${API_URL}/api/merchant/payments/${paymentId}/receipt.escpos`,
  bridgePrint: (paymentId: string) =>
    request<{
      bridge: { ok: false; status: string; message: string };
      receipt: Receipt;
    }>(`/api/merchant/payments/${paymentId}/receipt/bridge-print`, { method: "POST" }),
};

export interface ReceiptSettings {
  paperWidthMm: 58 | 80;
  headerText: string | null;
  footerText: string | null;
  thankYouText: string | null;
  updatedAt: string;
  printBridge: { status: string; note: string };
}

export interface Receipt {
  paymentId: string;
  shopName: string;
  brandName: string;
  printedAt: string;
  paymentAt: string;
  status: string;
  amountPaise: number;
  note: string | null;
  merchantOrderId: string | null;
  receivingVpa: string;
  utr: string | null;
  upiRef: string | null;
  gst: {
    ratePercent: number | null;
    taxablePaise: number | null;
    cgstPaise: number | null;
    sgstPaise: number | null;
    igstPaise: number | null;
  } | null;
  lines: Array<{ label: string; amountPaise: number | null; meta?: string }>;
  headerText: string | null;
  footerText: string | null;
  thankYouText: string | null;
  paperWidthMm: 58 | 80;
  textLines: string[];
  printBridge: { status: string; note: string };
}

export { API_URL };
