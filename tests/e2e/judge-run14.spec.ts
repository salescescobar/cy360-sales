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

test("design + responsive + refresh + back + empty state", async ({ page }) => {
  test.setTimeout(180_000);
  fs.mkdirSync("/tmp/judge", { recursive: true });
  await loginManager(page);

  // desktop screenshot
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/dashboard/orlando?period=month&date=2026-08-01");
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/tmp/judge/desktop.png", fullPage: true });

  // check accent color / negatives / rules
  const styleInfo = await page.evaluate(() => {
    const body = document.body;
    const all = Array.from(document.querySelectorAll("*"));
    const accentEls = all.filter(el => {
      const s = getComputedStyle(el);
      return s.color.includes("232, 80, 62") || s.backgroundColor.includes("232, 80, 62") || s.borderColor?.includes("232, 80, 62");
    });
    const parens = Array.from(document.querySelectorAll("body"))[0].innerText.match(/\([^)]*\$[^)]*\)/g);
    return {
      bodyColor: getComputedStyle(body).color,
      bodyBg: getComputedStyle(body).backgroundColor,
      accentElCount: accentEls.length,
      parenNegatives: parens,
      emDashCount: (document.body.innerText.match(/—/g) || []).length,
    };
  });
  log("style_info", styleInfo);

  // mobile viewport
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/orlando?period=month&date=2026-08-01");
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/tmp/judge/mobile.png", fullPage: true });
  const mobileScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const mobileClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  log("mobile_overflow", { scrollWidth: mobileScrollWidth, clientWidth: mobileClientWidth });

  await page.setViewportSize({ width: 1400, height: 900 });

  // refresh mid-flow: drill down then reload
  await page.goto("/dashboard/orlando/day/2026-08-01");
  await page.waitForTimeout(600);
  await page.locator("text=Food & Beverage").last().click({ force: true });
  await page.waitForTimeout(400);
  let body = (await page.textContent("body")) ?? "";
  log("before_reload_expanded", body.includes("▾ Food & Beverage"));
  await page.reload();
  await page.waitForTimeout(600);
  body = (await page.textContent("body")) ?? "";
  log("after_reload_url", page.url());
  log("after_reload_still_expanded", body.includes("▾ Food & Beverage"));

  // back button behavior
  await page.goto("/dashboard/orlando?period=month&date=2026-08-01");
  await page.waitForTimeout(500);
  await page.goto("/dashboard/orlando/day/2026-08-01");
  await page.waitForTimeout(500);
  await page.goBack();
  await page.waitForTimeout(500);
  log("back_button_url", page.url());
  body = (await page.textContent("body")) ?? "";
  log("back_button_body_snip", body.slice(0, 150));

  // empty state: a month far in the past with likely no data
  await page.goto("/dashboard/orlando?period=month&date=2020-01-01");
  await page.waitForTimeout(1000);
  body = (await page.textContent("body")) ?? "";
  log("empty_state_body", body.slice(0, 800));
});
