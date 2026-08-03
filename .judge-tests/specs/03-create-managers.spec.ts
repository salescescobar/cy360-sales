import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "judge-admin@cy360-sales.test";
const ADMIN_PASSWORD = "judge correct horse battery staple";

async function loginAdmin(page: any) {
  await page.goto("/admin/login", { waitUntil: "networkidle" });
  await page.locator('input[type="email"], input[name="email"]').first().fill(ADMIN_EMAIL);
  await page.locator('input[type="password"], input[name="password"]').first().fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");
}

test("inspect location options and create two managers for isolation test", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/managers", { waitUntil: "networkidle" });
  const options = await page.locator("select").first().locator("option").evaluateAll((els: any[]) =>
    els.map((e) => ({ value: e.value, text: e.textContent }))
  );
  console.log("LOCATION_OPTIONS", JSON.stringify(options));

  // Create manager A - orlando
  await page.locator('input[type="email"], input[name*="email" i]').first().fill("judge-orlando-mgr@example.com");
  await page.locator('input[name*="password" i], input[type="text"][name*="temp" i]').first().fill("JudgeOrlando123!");
  const select = page.locator("select").first();
  const optCount = await select.locator("option").count();
  if (optCount > 0) {
    const firstVal = await select.locator("option").nth(0).getAttribute("value");
    if (firstVal) await select.selectOption(firstVal);
  }
  await page.getByRole("button", { name: /create manager/i }).click();
  await page.waitForLoadState("networkidle");
  const body1 = await page.locator("body").innerText();
  console.log("AFTER_CREATE_A", JSON.stringify(body1.slice(0, 500)));
  await page.screenshot({ path: ".judge-tests/shots/after-create-mgr-a.png", fullPage: true });

  // If more than 1 location option exists, create manager B for a different location
  if (optCount > 1) {
    await page.locator('input[type="email"], input[name*="email" i]').first().fill("judge-secondloc-mgr@example.com");
    await page.locator('input[name*="password" i], input[type="text"][name*="temp" i]').first().fill("JudgeSecond123!");
    const secondVal = await select.locator("option").nth(1).getAttribute("value");
    if (secondVal) await select.selectOption(secondVal);
    await page.getByRole("button", { name: /create manager/i }).click();
    await page.waitForLoadState("networkidle");
    const body2 = await page.locator("body").innerText();
    console.log("AFTER_CREATE_B", JSON.stringify(body2.slice(0, 500)));
  } else {
    console.log("ONLY_ONE_LOCATION_AVAILABLE");
  }
});
