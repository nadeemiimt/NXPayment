import { test, expect } from "@playwright/test";
import {
  createPaymentViaApi,
  expectHeading,
  gotoPath,
  isAbsentRoute,
  uniqueRupees,
} from "./helpers";

test.describe("Confirm / reject pending payment", () => {
  test("reject pending payment", async ({ page, request }) => {
    const amount = uniqueRupees(41);
    await createPaymentViaApi(request, amount, `reject-${Date.now()}`);

    const res = await gotoPath(page, "/merchant/pending");
    expect(isAbsentRoute(res)).toBeFalsy();
    await expectHeading(page, /Pending confirms/i);

    const card = page.locator("article").filter({ hasText: amount }).first();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: /^Reject$/i }).click();
    await expect(card).toHaveCount(0, { timeout: 15_000 });
  });

  test("confirm pending payment and land on receipt", async ({ page, request }) => {
    const amount = uniqueRupees(47);
    await createPaymentViaApi(request, amount, `confirm-${Date.now()}`);

    const res = await gotoPath(page, "/merchant/pending");
    expect(isAbsentRoute(res)).toBeFalsy();

    const card = page.locator("article").filter({ hasText: amount }).first();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: /Confirm & print/i }).click();

    await expect(page).toHaveURL(/\/merchant\/receipts\//);
    await expectHeading(page, /Receipt/i);
  });
});
