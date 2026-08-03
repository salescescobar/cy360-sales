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

test("day view drilldown", async ({ page }) => {
  test.setTimeout(120_000);
  await loginManager(page);

  await page.goto("/dashboard/orlando/day/2026-08-01");
  await page.waitForTimeout(800);
  log("day_detail_url", page.url());
  const body = (await page.textContent("body")) ?? "";
  log("day_detail_body", body.slice(0, 3000));

  const links = await page.locator("a").evaluateAll((els: any[]) => els.map(e => ({ href: e.getAttribute("href"), text: e.textContent?.trim() })));
  log("day_detail_links", links.slice(0, 60));

  const buttons = await page.locator("button").evaluateAll((els: any[]) => els.map(e => e.textContent?.trim()));
  log("day_detail_buttons", buttons.slice(0, 60));
});
