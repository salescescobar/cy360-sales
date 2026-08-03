import { test, expect } from "@playwright/test";

async function loginManager(page: any) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').first().fill("judge-run2-orlando@example.com");
  await page.locator('input[type="password"]').first().fill("JudgeRun2Orlando!23");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");
}

test("inspect month input and navigate via UI", async ({ page }) => {
  await loginManager(page);
  await page.goto("/dashboard/orlando?period=month", { waitUntil: "networkidle" });
  const monthInput = page.locator('input[type="month"]');
  const attrs = await monthInput.evaluate((el: any) => ({ name: el.name, id: el.id, value: el.value }));
  console.log("MONTH_INPUT_ATTRS", JSON.stringify(attrs));

  await monthInput.fill("2026-07");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(500);
  console.log("URL_AFTER_FILL_JULY", page.url());
  const body = await page.locator("body").innerText();
  console.log("BODY_JULY", JSON.stringify(body.slice(0, 2000)));
  await page.screenshot({ path: ".judge-tests/shots/month-nav-july.png", fullPage: true });

  await monthInput.fill("2026-02");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(500);
  console.log("URL_AFTER_FILL_FEB", page.url());
  const body2 = await page.locator("body").innerText();
  console.log("BODY_FEB", JSON.stringify(body2.slice(0, 2000)));
  await page.screenshot({ path: ".judge-tests/shots/month-nav-feb.png", fullPage: true });
});
