import { test, type Page } from "@playwright/test";
import fs from "fs";

const creds = JSON.parse(fs.readFileSync("tests/e2e/judge-fixtures/admin-credentials.json", "utf-8"));
const MGR_EMAIL = `judge-review-month-${Date.now()}@example.com`;
const MGR_PASS = "reviewPass123!";

async function loginAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.locator('input[name="email"]').first().fill(creds.email);
  await page.locator('input[name="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle");
}

test("month view + gotab figure check", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/managers");
  await page.locator('input[name="email"]').first().fill(MGR_EMAIL);
  await page.locator('input[name="password"]').first().fill(MGR_PASS);
  await page.locator('input[type="radio"][value="orlando"]').check();
  await page.locator('button:has-text("Create manager")').click();
  await page.waitForLoadState("networkidle");

  await page.locator('a:has-text("Log out"), button:has-text("Log out")').first().click();
  await page.waitForLoadState("networkidle");

  await page.goto("/login");
  await page.locator('input[name="email"]').first().fill(MGR_EMAIL);
  await page.locator('input[name="password"]').first().fill(MGR_PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle");
  console.log("DASH_URL", page.url());

  // go to month view, august 2026
  await page.goto("/dashboard/orlando?period=month&date=2026-08-01");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "test-results/judge-month-view.png", fullPage: true });
  const body = await page.evaluate(() => document.body.innerText);
  console.log("MONTH_VIEW_BODY:\n" + body);
});
