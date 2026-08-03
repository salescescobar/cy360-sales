import { test } from "@playwright/test";
import fs from "node:fs";

async function loginManager(page: any) {
  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill("finaljudge-mgr-1785735838008@example.com");
  await page.locator('input[type="password"]').first().fill("JudgeTempPass!2026");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
}

test("screenshots", async ({ page }) => {
  test.setTimeout(60_000);
  fs.mkdirSync("test-results/judge", { recursive: true });
  await loginManager(page);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/dashboard/orlando?period=month&month=2026-08");
  await page.waitForTimeout(800);
  await page.screenshot({ path: "test-results/judge/desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/orlando?period=month&month=2026-08");
  await page.waitForTimeout(800);
  await page.screenshot({ path: "test-results/judge/mobile.png", fullPage: true });
});
