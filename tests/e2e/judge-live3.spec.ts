import { test } from "@playwright/test";
import fs from "fs";

const creds = JSON.parse(fs.readFileSync("tests/e2e/judge-fixtures/admin-credentials.json", "utf-8"));
const MGR_EMAIL = `judge-review-final-${Date.now()}@example.com`;
const MGR_PASS = "reviewPass123!";

test("create fresh orlando manager and inspect dashboard", async ({ page }) => {
  await page.goto("/admin/login");
  await page.locator('input[type="email"]').first().fill(creds.email);
  await page.locator('input[type="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle");

  await page.goto("/admin/managers");
  await page.locator('input[name="email"]').first().fill(MGR_EMAIL);
  await page.locator('input[name="password"]').first().fill(MGR_PASS);
  await page.locator('input[type="radio"][value="orlando"]').check();
  console.log("CREATING_EMAIL", MGR_EMAIL);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST"),
    page.locator('button:has-text("Create manager")').click(),
  ]);
  console.log("CREATE_RESP_STATUS", resp.status(), resp.url());
  await page.waitForLoadState("networkidle");
  console.log("AFTER_CREATE_URL", page.url());
  const fullBody = await page.evaluate(() => document.body.innerText);
  console.log("CONTAINS_NEW_EMAIL", fullBody.includes(MGR_EMAIL));
  console.log("FULL_BODY:\n" + fullBody);
  await page.screenshot({ path: "test-results/judge-after-create.png", fullPage: true });

  // log out admin
  const logout = page.locator('a:has-text("Log out"), button:has-text("Log out")').first();
  if (await logout.count()) {
    await logout.click();
    await page.waitForLoadState("networkidle");
  }
  console.log("AFTER_LOGOUT_URL", page.url());

  // sign in as manager
  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill(MGR_EMAIL);
  await page.locator('input[type="password"]').first().fill(MGR_PASS);
  await page.locator('button[type="submit"], button:has-text("Sign in")').first().click();
  await page.waitForLoadState("networkidle");
  console.log("MANAGER_LOGIN_URL", page.url());
  await page.screenshot({ path: "test-results/judge-mgr-dashboard.png", fullPage: true });
  const body2 = await page.evaluate(() => document.body.innerText);
  console.log("MANAGER_DASHBOARD_BODY:\n" + body2);
});
