import { test } from "@playwright/test";
import fs from "fs";

const creds = JSON.parse(fs.readFileSync("tests/e2e/judge-fixtures/admin-credentials.json", "utf-8"));

test("inspect business-lines filter form and select 2025-08", async ({ page }) => {
  await page.goto("/admin/login");
  await page.locator('input[name="email"]').first().fill(creds.email);
  await page.locator('input[name="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle");

  await page.goto("/admin/business-lines");
  await page.waitForLoadState("networkidle");
  console.log("URL", page.url());
  const selects = await page.locator("select").evaluateAll((els) =>
    els.map((e) => ({ name: e.getAttribute("name"), options: Array.from(e.querySelectorAll("option")).map(o => o.value) }))
  );
  console.log("SELECTS", JSON.stringify(selects, null, 2));

  const monthSelect = page.locator("select").nth(1);
  await monthSelect.selectOption("2025-08").catch(async (e) => {
    console.log("select by value failed, trying label", e.message);
  });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(500);
  console.log("URL_AFTER_SELECT", page.url());
  const body = await page.evaluate(() => document.body.innerText.slice(0, 1200));
  console.log("BODY_AFTER_SELECT:\n" + body);
});
