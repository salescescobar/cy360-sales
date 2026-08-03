import { test, expect } from "@playwright/test";

async function loginManager(page: any) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').first().fill("judge-run2-orlando@example.com");
  await page.locator('input[type="password"]').first().fill("JudgeRun2Orlando!23");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");
}

test("month view like4like comparison", async ({ page }) => {
  await loginManager(page);
  await page.goto("/dashboard/orlando?period=month&date=2026-07-15", { waitUntil: "networkidle" });
  const body = await page.locator("body").innerText();
  console.log("MONTH_VIEW_2026-07", JSON.stringify(body.slice(0, 3000)));
  await page.screenshot({ path: ".judge-tests/shots/month-view-july.png", fullPage: true });

  await page.goto("/dashboard/orlando?period=month&date=2026-02-15", { waitUntil: "networkidle" });
  const body2 = await page.locator("body").innerText();
  console.log("MONTH_VIEW_2026-02", JSON.stringify(body2.slice(0, 3000)));
  await page.screenshot({ path: ".judge-tests/shots/month-view-feb.png", fullPage: true });

  // current partial month (today = 2026-08-02)
  await page.goto("/dashboard/orlando?period=month&date=2026-08-02", { waitUntil: "networkidle" });
  const body3 = await page.locator("body").innerText();
  console.log("MONTH_VIEW_CURRENT_AUG", JSON.stringify(body3.slice(0, 3000)));
  await page.screenshot({ path: ".judge-tests/shots/month-view-aug-current.png", fullPage: true });
});

test("day view with data shows per-source breakdown", async ({ page }) => {
  await loginManager(page);
  await page.goto("/dashboard/orlando?period=day&date=2026-07-25", { waitUntil: "networkidle" });
  const body = await page.locator("body").innerText();
  console.log("DAY_VIEW_2026-07-25", JSON.stringify(body.slice(0, 2000)));
  await page.screenshot({ path: ".judge-tests/shots/day-view-2026-07-25.png", fullPage: true });
});
