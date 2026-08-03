import { test } from "@playwright/test";
import fs from "fs";

const creds = JSON.parse(fs.readFileSync("tests/e2e/judge-fixtures/admin-credentials.json", "utf-8"));

test("select 2025-08 month input on business-lines page", async ({ page }) => {
  await page.goto("/admin/login");
  await page.locator('input[name="email"]').first().fill(creds.email);
  await page.locator('input[name="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle");

  await page.goto("/admin/business-lines");
  await page.waitForLoadState("networkidle");
  const monthInput = page.locator('input[type="month"]');
  await monthInput.fill("2025-08");
  await page.waitForTimeout(600);
  console.log("URL", page.url());
  const body = await page.evaluate(() => document.body.innerText.slice(0, 1500));
  console.log("BODY:\n" + body);
  await page.screenshot({ path: "test-results/judge-unmapped-2025-08.png", fullPage: true });
});
