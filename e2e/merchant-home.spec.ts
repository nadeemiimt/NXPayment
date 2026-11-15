import { test, expect } from "@playwright/test";
import { expectHeading, gotoPath, isAbsentRoute, waitForApiHealth } from "./helpers";

test.describe("Merchant onboarding / home", () => {
  test("API health is up", async ({ request }) => {
    await waitForApiHealth(request);
  });

  test("onboarding smoke — load and save VPA", async ({ page }) => {
    const res = await gotoPath(page, "/merchant/onboarding");
    expect(isAbsentRoute(res)).toBeFalsy();
    await expectHeading(page, /Go-live setup/i);

    await page.getByRole("textbox", { name: /Primary UPI VPA/i }).fill("e2e-shop@upi");
    await page.getByRole("button", { name: /Save & continue/i }).click();
    await expect(page.getByText(/Saved\. Try a/i)).toBeVisible();
  });

  test("merchant home smoke", async ({ page }) => {
    const res = await gotoPath(page, "/merchant");
    expect(isAbsentRoute(res)).toBeFalsy();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /Review pending/i })).toBeVisible();
    // Home CTA only (nav also has Inventory in desktop + mobile shells)
    await expect(page.locator('a.h-14[href="/merchant/inventory"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /Generate display code/i })).toBeVisible();
  });
});
