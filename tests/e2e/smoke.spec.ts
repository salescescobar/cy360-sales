import { test, expect } from "@playwright/test";
/** Minimum bar: the product loads and the review queue renders. */
test("app loads and shows the approval queue", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /queue|review/i })).toBeVisible();
});
