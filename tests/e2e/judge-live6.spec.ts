import { test, type Page } from "@playwright/test";
import fs from "fs";

const creds = JSON.parse(fs.readFileSync("tests/e2e/judge-fixtures/admin-credentials.json", "utf-8"));
const MGR_EMAIL = `judge-review-drill-${Date.now()}@example.com`;
const MGR_PASS = "reviewPass123!";

async function loginAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.locator('input[name="email"]').first().fill(creds.email);
  await page.locator('input[name="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle");
}

test("day view gotab figure + drilldown", async ({ page }) => {
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

  await page.goto("/dashboard/orlando?period=day&date=2026-08-01");
  await page.waitForLoadState("networkidle");
  const body = await page.evaluate(() => document.body.innerText);
  console.log("DAY_2026-08-01_BODY:\n" + body);
  await page.screenshot({ path: "test-results/judge-day-20260801.png", fullPage: true });

  // try clicking a business line row to drill down
  const fnbRow = page.locator('text=Food & Beverage').first();
  console.log("FNB_COUNT", await fnbRow.count());
  if (await fnbRow.count()) {
    await fnbRow.click().catch((e) => console.log("CLICK_ERR", e.message));
    await page.waitForLoadState("networkidle").catch(() => {});
    console.log("AFTER_CLICK_URL", page.url());
    const body2 = await page.evaluate(() => document.body.innerText);
    console.log("AFTER_CLICK_BODY:\n" + body2.slice(0, 2000));
    await page.screenshot({ path: "test-results/judge-drill-1.png", fullPage: true });
  }
});
