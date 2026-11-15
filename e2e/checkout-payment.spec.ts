import { test, expect } from "@playwright/test";
import {
  createPaymentViaApi,
  expectHeading,
  gotoPath,
  isAbsentRoute,
  uniqueRupees,
} from "./helpers";

test.describe("Checkout / payment QR wait", () => {
  test("create payment from checkout UI and show QR wait", async ({ page }) => {
    const res = await gotoPath(page, "/checkout");
    expect(isAbsentRoute(res)).toBeFalsy();
    await expectHeading(page, /Pay /i);

    const amount = uniqueRupees(23);
    await page.getByLabel(/Amount \(₹\)/i).fill(amount);
    await page.getByLabel(/Note \(optional\)/i).fill(`e2e-checkout-${Date.now()}`);
    await page.getByRole("button", { name: /Continue to UPI/i }).click();

    await expect(page).toHaveURL(/\/checkout\/[A-Za-z0-9_-]+/);
    await expect(page.getByRole("heading", { name: /Waiting for merchant confirmation/i })).toBeVisible();
    await expect(page.getByText(amount).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Open UPI app/i })).toBeVisible();
    await expect(page.getByText(/Waiting for merchant to confirm this amount/i)).toBeVisible();
    // QR is an SVG rendered by qrcode.react
    await expect(page.locator("svg").first()).toBeVisible();
  });

  test("buyer wait page loads for API-created payment", async ({ page, request }) => {
    const payment = await createPaymentViaApi(request, uniqueRupees(31), "api-create");
    const res = await gotoPath(page, `/checkout/${payment.id}`);
    expect(isAbsentRoute(res)).toBeFalsy();
    await expect(page.getByRole("heading", { name: /Waiting for merchant confirmation/i })).toBeVisible();
  });
});
