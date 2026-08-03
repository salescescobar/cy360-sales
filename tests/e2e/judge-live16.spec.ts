import { test } from "@playwright/test";
import fs from "fs";

const creds = JSON.parse(fs.readFileSync("tests/e2e/judge-fixtures/admin-credentials.json", "utf-8"));
const MGR_EMAIL = `judge-review-pii-${Date.now()}@example.com`;
const MGR_PASS = "reviewPass123!";

test("drill into all business lines for pii scan", async ({ page }) => {
  await page.goto("/admin/login");
  await page.locator('input[name="email"]').first().fill(creds.email);
  await page.locator('input[name="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle");
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

  await page.goto("/dashboard/orlando?period=month&date=2026-08-01");
  await page.waitForLoadState("networkidle");

  for (const line of ["Pickleball Revenue", "Memberships", "Events", "Lessons & Classes"]) {
    const row = page.locator("tbody tr", { hasText: line }).first();
    if (await row.count()) {
      await row.click();
      await page.waitForTimeout(500);
      // expand any group rows that appeared
      const groupRows = await page.locator("tbody tr").all();
    }
  }
  await page.waitForTimeout(500);
  const body = await page.evaluate(() => document.body.innerText);
  console.log("FULL_EXPANDED_BODY:\n" + body);
});
