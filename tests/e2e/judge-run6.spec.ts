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

test("drilldown + isolation + guards", async ({ page }) => {
  test.setTimeout(180_000);
  await loginManager(page);

  await page.goto("/dashboard/orlando?period=day&date=2026-08-01");
  await page.waitForTimeout(800);

  // drilldown click 1: business line -> group
  const fb = page.locator('text=Food & Beverage').first();
  await fb.click().catch((e:any) => log("click1_err", String(e)));
  await page.waitForTimeout(800);
  log("after_click1_url", page.url());
  const b1 = (await page.textContent("body")) ?? "";
  log("after_click1_body_snip", b1.slice(0, 1200));

  // try to find a clickable group link/row to go deeper
  const groupLinks = await page.locator("a").evaluateAll((els: any[]) => els.map(e => ({ href: e.getAttribute("href"), text: e.textContent?.trim() })));
  log("links_after_click1", groupLinks.slice(0, 40));

  fs.mkdirSync("/tmp/judge", { recursive: true });
  await page.screenshot({ path: "/tmp/judge/drill1.png", fullPage: true });

  // manager tries admin routes
  for (const path of ["/admin", "/admin/managers", "/admin/reconciliation", "/admin/business-lines", "/import"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle").catch(() => {});
    const body = (await page.textContent("body")) ?? "";
    log("manager_tries_" + path, { url: page.url(), snip: body.slice(0, 200) });
  }

  // manager tries another location via URL edit
  for (const loc of ["nashville", "mt_pleasant", "miami", "../admin", "orlando/../nashville"]) {
    await page.goto(`/dashboard/${loc}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    const body = (await page.textContent("body")) ?? "";
    log("manager_tries_location_" + loc, { url: page.url(), snip: body.slice(0, 300) });
  }
});
