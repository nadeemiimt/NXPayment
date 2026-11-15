import { test, expect } from "@playwright/test";
import { expectHeading, gotoPath, isAbsentRoute } from "./helpers";

test.describe("Reports / loyalty / storage smoke", () => {
  test("reports page loads", async ({ page }) => {
    const res = await gotoPath(page, "/merchant/reports");
    expect(isAbsentRoute(res)).toBeFalsy();
    await expectHeading(page, /^Reports$/i);
    await expect(page.getByRole("heading", { name: /GST settings/i })).toBeVisible();
  });

  test("loyalty page loads", async ({ page }) => {
    const res = await gotoPath(page, "/merchant/loyalty");
    expect(isAbsentRoute(res)).toBeFalsy();
    await expectHeading(page, /^Loyalty$/i);
    await expect(page.getByRole("heading", { name: /Enroll customer/i })).toBeVisible();
  });

  test("storage page loads", async ({ page }) => {
    const res = await gotoPath(page, "/merchant/storage");
    expect(isAbsentRoute(res)).toBeFalsy();
    await expectHeading(page, /^Storage$/i);
    await expect(page.getByText(/Local SQLite WAL stays primary/i)).toBeVisible();
  });

  test("tokens page smoke (skip if absent)", async ({ page }) => {
    const res = await gotoPath(page, "/merchant/tokens");
    if (isAbsentRoute(res)) {
      test.skip(true, "/merchant/tokens not present on this build");
      return;
    }
    // If the route exists (older stack PRs), just assert a heading or main landmark
    await expect(page.locator("h1, main, [role='main']").first()).toBeVisible();
  });
});
