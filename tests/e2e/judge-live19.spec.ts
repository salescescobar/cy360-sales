import { test } from "@playwright/test";
import fs from "fs";

const creds = JSON.parse(fs.readFileSync("tests/e2e/judge-fixtures/admin-credentials.json", "utf-8"));
const MGR_EMAIL = `judge-review-mem-${Date.now()}@example.com`;
const MGR_PASS = "reviewPass123!";

test("isolated memberships click", async ({ page }) => {
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

  await page.goto("/dashboard/orlando?period=day&date=2026-08-01");
  await page.waitForLoadState("networkidle");

  const row = page.locator("tbody tr", { hasText: "Memberships" }).first();
  console.log("ROW_COUNT", await row.count());
  console.log("ROW_TEXT_BEFORE", await row.textContent());
  await row.click();
  await page.waitForTimeout(1000);
  console.log("ROW_TEXT_AFTER", await row.textContent());
  const body = await page.evaluate(() => document.body.innerText);
  console.log("BODY_AFTER:\n" + body);

  const groupRow = page.locator("tbody tr", { hasText: "Membership Fee" }).first();
  await groupRow.click();
  await page.waitForTimeout(800);
  const body2 = await page.evaluate(() => document.body.innerText);
  console.log("BODY_AFTER_GROUP_CLICK:\n" + body2);

  const itemRows = page.locator("tbody tr", { hasText: "Membership Dues" });
  const lastItem = itemRows.last();
  await lastItem.click();
  await page.waitForTimeout(800);
  const body3 = await page.evaluate(() => document.body.innerText);
  console.log("BODY_AFTER_ITEM_CLICK:\n" + body3);
});
