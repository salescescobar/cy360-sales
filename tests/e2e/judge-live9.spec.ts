import { test } from "@playwright/test";
import fs from "fs";

const creds = JSON.parse(fs.readFileSync("tests/e2e/judge-fixtures/admin-credentials.json", "utf-8"));

test("check unmapped items in admin business-lines for 2025-08", async ({ page }) => {
  await page.goto("/admin/login");
  await page.locator('input[name="email"]').first().fill(creds.email);
  await page.locator('input[name="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle");

  for (const month of ["2025-08", "2026-07", "2026-08"]) {
    await page.goto(`/admin/business-lines?location=orlando&month=${month}`);
    await page.waitForLoadState("networkidle");
    const body = await page.evaluate(() => document.body.innerText.slice(0, 1200));
    console.log(`MONTH ${month}:\n` + body + "\n===");
  }
});
