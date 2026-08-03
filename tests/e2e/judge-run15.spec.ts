import { test } from "@playwright/test";

const log = (k: string, v: any) => console.log("RESULT " + k + " " + JSON.stringify(v));

async function loginManager(page: any) {
  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill("finaljudge-mgr-1785735838008@example.com");
  await page.locator('input[type="password"]').first().fill("JudgeTempPass!2026");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
}

test("empty state proper param", async ({ page }) => {
  test.setTimeout(60_000);
  await loginManager(page);
  for (const url of [
    "/dashboard/orlando?period=month&month=2020-01",
    "/dashboard/orlando?period=day&date=2020-01-15",
    "/dashboard/orlando?period=month&month=2024-01",
  ]) {
    await page.goto(url);
    await page.waitForTimeout(1000);
    log("url_" + url, page.url());
    const body = (await page.textContent("body")) ?? "";
    log("body_" + url, body.slice(0, 700));
  }
});
