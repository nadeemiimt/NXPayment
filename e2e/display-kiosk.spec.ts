import { test, expect } from "@playwright/test";
import { gotoPath, isAbsentRoute } from "./helpers";

test.describe("Display kiosk", () => {
  test("generate code and open kiosk route", async ({ page }) => {
    const home = await gotoPath(page, "/merchant");
    expect(isAbsentRoute(home)).toBeFalsy();

    await page.getByRole("button", { name: /Generate display code/i }).click();
    const link = page.locator("a[href*='/display/']").first();
    await expect(link).toBeVisible({ timeout: 15_000 });
    const href = await link.getAttribute("href");
    expect(href).toMatch(/\/display\/[A-Za-z0-9]+/);

    const path = href!.includes("://") ? new URL(href!).pathname : href!;
    const res = await gotoPath(page, path);
    expect(isAbsentRoute(res)).toBeFalsy();
    // Idle kiosk shows brand + ready/waiting copy
    await expect(page.locator(".kiosk-root")).toBeVisible();
    await expect(page.getByText(/Ready for next payment|Waiting for payment|NXPayment/i).first()).toBeVisible();
  });
});
