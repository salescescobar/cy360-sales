import { test } from "@playwright/test";
import fs from "fs";

const creds = JSON.parse(fs.readFileSync("tests/e2e/judge-fixtures/admin-credentials.json", "utf-8"));
const MGR_EMAIL = `judge-review-design-${Date.now()}@example.com`;
const MGR_PASS = "reviewPass123!";

async function loginMgr(page) {
  await page.goto("/admin/login");
  await page.locator('input[name="email"]').first().fill(creds.email);
  await page.locator('input[name="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle");
  await page.goto("/admin/managers");
  await page.locator('input[name="email"]').first().fill(MGR_EMAIL);
  await page.locator('input[name="password"]').first().fill(MGR_PASS);
  await page.locator('input[type="radio"][value="orlando"]').check();
  await page.locator('button:has-text("Create manager")').click();
  await page.waitForLoadState("networkidle");
  await page.locator('a:has-text("Log out"), button:has-text("Log out")').first().click();
  await page.waitForLoadState("networkidle");
  await page.goto("/login");
  await page.locator('input[name="email"]').first().fill(MGR_EMAIL);
  await page.locator('input[name="password"]').first().fill(MGR_PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle");
}

test("desktop design screenshot", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginMgr(page);
  await page.goto("/dashboard/orlando?period=month&date=2026-08-01");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "test-results/judge-design-desktop.png", fullPage: true });

  // check colors used
  const styles = await page.evaluate(() => {
    const h1 = document.querySelector("h1, h2");
    const body = document.body;
    return {
      bodyColor: getComputedStyle(body).color,
      h1Color: h1 ? getComputedStyle(h1).color : null,
    };
  });
  console.log("STYLES", JSON.stringify(styles));
});

test("mobile 390px design screenshot", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginMgr(page);
  await page.goto("/dashboard/orlando?period=month&date=2026-08-01");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "test-results/judge-design-mobile.png", fullPage: true });
});
