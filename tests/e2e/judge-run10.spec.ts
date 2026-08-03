import { test } from "@playwright/test";
import fs from "node:fs";

const log = (k: string, v: any) => console.log("RESULT " + k + " " + JSON.stringify(v));

async function loginAdmin(page: any) {
  await page.goto("/admin/login");
  await page.locator('input[type="email"]').first().fill("judge-admin@cy360-sales.test");
  await page.locator('input[type="password"]').first().fill("judge correct horse battery staple");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
}

test("admin checks: unmapped, alerts, reconciliation", async ({ page }) => {
  test.setTimeout(150_000);
  await loginAdmin(page);

  // business-lines for a month with known unmapped ($360 same-month-last-year -> 2025-08)
  await page.goto("/admin/business-lines");
  await page.waitForTimeout(600);
  // find month input and set to 2025-08
  const monthInput = page.locator('input[type="month"]').first();
  const monthCount = await monthInput.count();
  log("month_input_count", monthCount);
  if (monthCount > 0) {
    await monthInput.fill("2025-08");
    await page.waitForTimeout(800);
  }
  let body = (await page.textContent("body")) ?? "";
  log("business_lines_2025_08", body.slice(0, 1500));
  fs.mkdirSync("/tmp/judge", { recursive: true });
  fs.writeFileSync("/tmp/judge/business-lines-2025-08.html", await page.content());

  // alerts page
  await page.goto("/admin/alerts");
  await page.waitForTimeout(600);
  body = (await page.textContent("body")) ?? "";
  log("alerts_page", body.slice(0, 2000));

  // reconciliation with explicit month select and wait
  await page.goto("/admin/reconciliation");
  await page.waitForTimeout(2000);
  body = (await page.textContent("body")) ?? "";
  log("reconciliation_after_wait", body.slice(0, 2500));
  fs.writeFileSync("/tmp/judge/reconciliation.html", await page.content());
});
