import { test, expect } from "@playwright/test";
import { expectHeading, gotoPath, isAbsentRoute } from "./helpers";

test.describe("Inventory CRUD", () => {
  test("list + quick add item", async ({ page }) => {
    const res = await gotoPath(page, "/merchant/inventory");
    expect(isAbsentRoute(res)).toBeFalsy();
    await expectHeading(page, /Inventory/i);

    const name = `E2E Soap ${Date.now()}`;
    await page.getByPlaceholder("Item name").fill(name);
    await page.getByPlaceholder("Stock qty").fill("25");
    await page.getByPlaceholder("Bulk qty").fill("100");
    await page.getByPlaceholder("Bulk cost ₹").fill("200");
    await page.getByPlaceholder(/Sell ₹ \/ unit/i).fill("5");
    await page.getByRole("button", { name: /Quick add/i }).click();

    await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });
  });
});
