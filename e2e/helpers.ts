import { expect, type APIRequestContext, type Page, type Response } from "@playwright/test";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3847";

export async function gotoPath(page: Page, path: string): Promise<Response | null> {
  return page.goto(path, { waitUntil: "domcontentloaded" });
}

/** True when Next/API served a real page (not an absent feature route). */
export function isAbsentRoute(res: Response | null): boolean {
  return !!res && res.status() === 404;
}

export async function expectHeading(page: Page, name: string | RegExp) {
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

export function uniqueRupees(base = 17): string {
  const cents = Math.floor(Math.random() * 90) + 10;
  return `${base}.${cents}`;
}

export async function createPaymentViaApi(
  request: APIRequestContext,
  amountInr: string,
  note?: string
) {
  const amountPaise = Math.round(Number(amountInr) * 100);
  const res = await request.post(`${API_URL}/api/payments`, {
    data: {
      amountPaise,
      note: note ?? `e2e-${Date.now()}`,
      confirmDuplicate: true,
      idempotencyKey: `e2e-${amountPaise}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.payment as { id: string; amountPaise: number; status: string };
}

export async function waitForApiHealth(request: APIRequestContext) {
  const res = await request.get(`${API_URL}/health`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.ok).toBe(true);
}
