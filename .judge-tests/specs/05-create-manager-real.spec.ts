import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "judge-admin@cy360-sales.test";
const ADMIN_PASSWORD = "judge correct horse battery staple";
export const MGR_EMAIL = "judge-run2-orlando@example.com";
export const MGR_PASSWORD = "JudgeRun2Orlando!23";

test("create orlando manager account", async ({ page }) => {
  await page.goto("/admin/login", { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').first().fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");
  await page.goto("/admin/managers", { waitUntil: "networkidle" });

  await page.locator('input[name="email"]').fill(MGR_EMAIL);
  await page.locator('input[name="password"]').fill(MGR_PASSWORD);
  await page.locator('input[name="location"][value="orlando"]').check();
  await page.getByRole("button", { name: /create manager/i }).click();
  await page.waitForLoadState("networkidle");
  const body = await page.locator("body").innerText();
  console.log("CREATE_RESULT", body.includes(MGR_EMAIL) ? "FOUND_IN_LIST" : "NOT_FOUND");
  await page.screenshot({ path: ".judge-tests/shots/mgr-created.png", fullPage: true });
});
