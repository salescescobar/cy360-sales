import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const ADMIN_EMAIL = "judge-admin@cy360-sales.test";
const ADMIN_PASSWORD = "judge correct horse battery staple";

test("admin sign in and create manager account", async ({ page }) => {
  await page.goto("/admin/login", { waitUntil: "networkidle" });
  await page.locator('input[type="email"], input[name="email"]').first().fill(ADMIN_EMAIL);
  await page.locator('input[type="password"], input[name="password"]').first().fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");
  console.log("AFTER_LOGIN_URL", page.url());
  await page.screenshot({ path: ".judge-tests/shots/admin-after-login.png", fullPage: true });
  const body = await page.locator("body").innerText();
  console.log("AFTER_LOGIN_BODY", JSON.stringify(body.slice(0, 1500)));

  // go to managers page
  await page.goto("/admin/managers", { waitUntil: "networkidle" });
  console.log("MANAGERS_URL", page.url());
  await page.screenshot({ path: ".judge-tests/shots/admin-managers.png", fullPage: true });
  const mbody = await page.locator("body").innerText();
  console.log("MANAGERS_BODY", JSON.stringify(mbody.slice(0, 2000)));

  // try to find a form to create manager for Orlando
  const emailInput = page.locator('input[type="email"], input[name*="email" i]').first();
  const hasForm = await emailInput.count();
  console.log("HAS_EMAIL_INPUT_ON_MANAGERS_PAGE", hasForm);
  if (hasForm) {
    const html = await page.content();
    fs.writeFileSync(path.join(__dirname, "..", "shots", "managers-page.html"), html);
  }
});
