import { test, expect } from "@playwright/test";
/** Minimum bar: the product loads and routes an unauthenticated visitor to sign in.
 *  The full flow (Orlando sees Orlando, others blocked, day/month toggle) lives in
 *  tests/e2e/dashboard.spec.ts — this is just the fast up/down check. */
test("app loads and routes to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "CY360 Sales" })).toBeVisible();
});

test("deep link to /dashboard with no location redirects to sign in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
