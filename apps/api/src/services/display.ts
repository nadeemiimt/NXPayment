import { nanoid } from "nanoid";
import { getDb } from "../db/schema.js";
import { getMerchantConfig } from "./merchant.js";
import { getPayment, listPendingConfirms } from "./payments.js";
import { getActiveShop, getShop } from "./shops.js";

export interface DisplayPaymentView {
  id: string;
  amountPaise: number;
  status: string;
  upiUri: string;
  receivingName: string;
  expiresAt: string;
  updatedAt: string;
}

export interface DisplaySessionDto {
  code: string;
  shopId: string | null;
  label: string | null;
  createdAt: string;
  updatedAt: string;
  urlPath: string;
}

export interface DisplayStateDto {
  code: string;
  merchantName: string;
  brandName: string;
  shopName: string | null;
  status: "idle" | "waiting" | "paid" | "expired" | "failed";
  amountPaise: number | null;
  payment: DisplayPaymentView | null;
  updatedAt: string;
}

interface SessionRow {
  code: string;
  shop_id: string | null;
  label: string | null;
  created_at: string;
  updated_at: string;
}

function toSession(row: SessionRow): DisplaySessionDto {
  return {
    code: row.code,
    shopId: row.shop_id,
    label: row.label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    urlPath: `/display/${row.code}`,
  };
}

function makeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const raw = nanoid(6);
  for (let i = 0; i < 6; i++) {
    out += alphabet[raw.charCodeAt(i) % alphabet.length];
  }
  return out;
}

function toView(p: {
  id: string;
  amountPaise: number;
  status: string;
  upiUri: string;
  receivingName: string;
  expiresAt: string;
  updatedAt: string;
}): DisplayPaymentView {
  return {
    id: p.id,
    amountPaise: p.amountPaise,
    status: p.status,
    upiUri: p.upiUri,
    receivingName: p.receivingName,
    expiresAt: p.expiresAt,
    updatedAt: p.updatedAt,
  };
}

export function listDisplaySessions(): DisplaySessionDto[] {
  const rows = getDb()
    .prepare(`SELECT * FROM display_sessions ORDER BY created_at DESC`)
    .all() as SessionRow[];
  return rows.map(toSession);
}

export function getDisplaySession(code: string): DisplaySessionDto | null {
  const row = getDb()
    .prepare(`SELECT * FROM display_sessions WHERE code = ?`)
    .get(code.toUpperCase()) as SessionRow | undefined;
  return row ? toSession(row) : null;
}

export function createDisplaySession(input?: {
  shopId?: string | null;
  label?: string | null;
}): DisplaySessionDto {
  const shopId = input?.shopId ?? getActiveShop()?.id ?? null;
  if (shopId && !getShop(shopId)) throw new Error("Shop not found");
  let code = makeCode();
  for (let i = 0; i < 5; i++) {
    if (!getDisplaySession(code)) break;
    code = makeCode();
  }
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO display_sessions (code, shop_id, label, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(code, shopId, input?.label ?? null, now, now);
  return getDisplaySession(code)!;
}

export function getDisplayState(code: string): DisplayStateDto | null {
  const session = getDisplaySession(code);
  if (!session) return null;
  const merchant = getMerchantConfig();
  const shop = session.shopId ? getShop(session.shopId) : getActiveShop();

  const pending = listPendingConfirms();
  const open =
    (session.shopId
      ? pending.find((p) => {
          const row = getDb()
            .prepare(`SELECT shop_id FROM payments WHERE id = ?`)
            .get(p.id) as { shop_id: string | null } | undefined;
          return row?.shop_id === session.shopId || row?.shop_id == null;
        })
      : pending[0]) ?? null;

  if (open) {
    return {
      code: session.code,
      merchantName: merchant.displayName,
      brandName: merchant.brandName,
      shopName: shop?.name ?? null,
      status: "waiting",
      amountPaise: open.amountPaise,
      payment: toView(open),
      updatedAt: new Date().toISOString(),
    };
  }

  const recentRow = session.shopId
    ? (getDb()
        .prepare(
          `SELECT id FROM payments
           WHERE status IN ('SUCCESS','FAILED','EXPIRED') AND (shop_id = ? OR shop_id IS NULL)
           ORDER BY updated_at DESC LIMIT 1`
        )
        .get(session.shopId) as { id: string } | undefined)
    : (getDb()
        .prepare(
          `SELECT id FROM payments WHERE status IN ('SUCCESS','FAILED','EXPIRED')
           ORDER BY updated_at DESC LIMIT 1`
        )
        .get() as { id: string } | undefined);

  const recent = recentRow ? getPayment(recentRow.id) : null;
  const fresh =
    recent && Date.now() - new Date(recent.updatedAt).getTime() < 60_000 ? recent : null;

  let status: DisplayStateDto["status"] = "idle";
  if (fresh?.status === "SUCCESS") status = "paid";
  else if (fresh?.status === "EXPIRED") status = "expired";
  else if (fresh?.status === "FAILED") status = "failed";

  return {
    code: session.code,
    merchantName: merchant.displayName,
    brandName: merchant.brandName,
    shopName: shop?.name ?? null,
    status,
    amountPaise: fresh?.amountPaise ?? null,
    payment: fresh ? toView(fresh) : null,
    updatedAt: new Date().toISOString(),
  };
}
