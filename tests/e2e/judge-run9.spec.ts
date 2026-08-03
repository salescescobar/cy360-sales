import { test } from "@playwright/test";

const log = (k: string, v: any) => console.log("RESULT " + k + " " + JSON.stringify(v));

async function loginManager(page: any) {
  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill("finaljudge-mgr-1785735838008@example.com");
  await page.locator('input[type="password"]').first().fill("JudgeTempPass!2026");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
}

test("3 click drilldown", async ({ page }) => {
  test.setTimeout(120_000);
  await loginManager(page);
  await page.goto("/dashboard/orlando/day/2026-08-01");
  await page.waitForTimeout(800);

  // click 1: expand Food & Beverage
  await page.locator("text=Food & Beverage").last().click({ force: true });
  await page.waitForTimeout(500);
  let body = (await page.textContent("body")) ?? "";
  log("after_click1", body.slice(0, 500));

  // click 2: expand uncategorized group
  await page.locator("text=uncategorized").last().click({ force: true });
  await page.waitForTimeout(500);
  body = (await page.textContent("body")) ?? "";
  log("after_click2", body.slice(0, 1500));

  const html2 = await page.content();
  require("fs").writeFileSync("/tmp/judge/afterclick2.html", html2);

  // click 3: expand the innermost uncategorized
  await page.locator("text=uncategorized").last().click({ force: true });
  await page.waitForTimeout(500);
  body = (await page.textContent("body")) ?? "";
  log("after_click3", body.slice(0, 2500));
  require("fs").writeFileSync("/tmp/judge/afterclick3.html", await page.content());
});
