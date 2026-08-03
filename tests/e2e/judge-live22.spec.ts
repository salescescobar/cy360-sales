import { test } from "@playwright/test";
import fs from "fs";

const creds = JSON.parse(fs.readFileSync("tests/e2e/judge-fixtures/admin-credentials.json", "utf-8"));

test("malformed and empty csv upload", async ({ page }) => {
  await page.goto("/admin/login");
  await page.locator('input[name="email"]').first().fill(creds.email);
  await page.locator('input[name="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle");

  for (const f of ["malformed.csv", "empty.csv"]) {
    await page.goto("/import");
    await page.waitForLoadState("networkidle");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.locator('input[type="file"]').setInputFiles(`tests/e2e/judge-fixtures/${f}`);
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Preview")').click();
    await page.waitForTimeout(3000);
    const body = await page.evaluate(() => document.body.innerText.slice(0, 800));
    console.log(`FILE ${f}:\n` + body + "\nERRORS:" + JSON.stringify(errors) + "\n===");
  }
});
