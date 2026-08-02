import { test } from "@playwright/test";

test("judge: longstr resolves + responsive + throttle", async ({ page, browser }) => {
  await page.goto("/");
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: /continue/i }).first().click();
  await page.waitForLoadState("networkidle").catch(() => {});

  const longStr = "A".repeat(10000);
  await page.goto("/dashboard/orlando?date=" + longStr);
  await page.waitForTimeout(3000);
  const bodyAfterWait = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log("LONGSTR_AFTER_WAIT=" + bodyAfterWait);

  // responsive check at 390px
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/orlando");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/05-mobile.png", fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5);
  console.log("MOBILE_HORIZONTAL_OVERFLOW=" + overflow);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/06-mobile-login.png", fullPage: true });
});
