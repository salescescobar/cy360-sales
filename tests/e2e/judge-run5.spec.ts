import { test } from "@playwright/test";
import fs from "node:fs";

const log = (k: string, v: any) => console.log("RESULT " + k + " " + JSON.stringify(v));

async function loginManager(page: any) {
  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill("finaljudge-mgr-1785735838008@example.com");
  await page.locator('input[type="password"]').first().fill("JudgeTempPass!2026");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
}

test("month view + gotab figure + drilldown", async ({ page }) => {
  test.setTimeout(120_000);
  await loginManager(page);

  // Month view
  await page.goto("/dashboard/orlando?period=month&date=2026-08-01");
  await page.waitForTimeout(1000);
  const monthBody = (await page.textContent("body")) ?? "";
  log("month_view_body", monthBody);

  // GoTab specific date 2026-08-01, day view
  await page.goto("/dashboard/orlando?period=day&date=2026-08-01");
  await page.waitForTimeout(1000);
  const dayBody = (await page.textContent("body")) ?? "";
  log("day_2026_08_01_body", dayBody);

  await page.screenshot({ path: "/tmp/judge-day-08-01.png", fullPage: true });
});
