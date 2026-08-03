import { test } from "@playwright/test";
import fs from "fs";

const creds = JSON.parse(fs.readFileSync("tests/e2e/judge-fixtures/admin-credentials.json", "utf-8"));
const MGR_EMAIL = `judge-review-drill3-${Date.now()}@example.com`;
const MGR_PASS = "reviewPass123!";

async function loginAdmin(page) {
  await page.goto("/admin/login");
  await page.locator('input[name="email"]').first().fill(creds.email);
  await page.locator('input[name="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle");
}

test("click business line row and observe change", async ({ page }) => {
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
  const before = await page.evaluate(() => document.body.innerText);

  const row = page.locator("tbody tr", { hasText: "Food & Beverage" }).first();
  await row.click();
  await page.waitForTimeout(800);
  console.log("URL_AFTER_ROW_CLICK", page.url());
  const after = await page.evaluate(() => document.body.innerText);
  console.log("CHANGED", before !== after);
  console.log("AFTER_TEXT:\n" + after);
  await page.screenshot({ path: "test-results/judge-drill-row-click.png", fullPage: true });

  const groupRow = page.locator("tbody tr", { hasText: "uncategorized" }).first();
  await groupRow.click();
  await page.waitForTimeout(800);
  const after2 = await page.evaluate(() => document.body.innerText);
  console.log("URL_AFTER_GROUP_CLICK", page.url());
  console.log("AFTER_GROUP_TEXT:\n" + after2);
  await page.screenshot({ path: "test-results/judge-drill-group-click.png", fullPage: true });

  const itemRows = page.locator("tbody tr", { hasText: "uncategorized" });
  console.log("ITEM_ROW_COUNT", await itemRows.count());
  const lastItemRow = itemRows.last();
  await lastItemRow.click();
  await page.waitForTimeout(800);
  const after3 = await page.evaluate(() => document.body.innerText);
  console.log("URL_AFTER_ITEM_CLICK", page.url());
  console.log("AFTER_ITEM_TEXT:\n" + after3);
  await page.screenshot({ path: "test-results/judge-drill-item-click.png", fullPage: true });
});
