import { test } from "@playwright/test";
import fs from "fs";

const creds = JSON.parse(fs.readFileSync("tests/e2e/judge-fixtures/admin-credentials.json", "utf-8"));

test("admin login and explore", async ({ page }) => {
  await page.goto("/admin/login");
  await page.screenshot({ path: "test-results/judge-admin-login.png", fullPage: true });
  console.log("ADMIN_LOGIN_URL", page.url());
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passInput = page.locator('input[type="password"]').first();
  await emailInput.fill(creds.email);
  await passInput.fill(creds.password);
  await page.locator('button:has-text("Sign in"), button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle");
  console.log("AFTER_LOGIN_URL", page.url());
  await page.screenshot({ path: "test-results/judge-admin-home.png", fullPage: true });
  const body = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log("ADMIN_BODY:\n" + body);

  // try admin managers page
  for (const path of ["/admin/managers", "/admin/business-lines", "/admin/reconciliation", "/import"]) {
    const resp = await page.goto(path, { waitUntil: "networkidle" }).catch(() => null);
    console.log(path, "STATUS", resp?.status(), "FINAL_URL", page.url());
    const txt = await page.evaluate(() => document.body.innerText.slice(0, 1500));
    console.log(path, "BODY:\n" + txt);
    await page.screenshot({ path: `test-results/judge-admin-${path.replace(/\//g, "_")}.png`, fullPage: true });
  }
});
