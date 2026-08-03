import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

const ADMIN_EMAIL = "judge-admin@cy360-sales.test";
const ADMIN_PASSWORD = "judge correct horse battery staple";

test("dump managers page form html", async ({ page }) => {
  await page.goto("/admin/login", { waitUntil: "networkidle" });
  await page.locator('input[type="email"], input[name="email"]').first().fill(ADMIN_EMAIL);
  await page.locator('input[type="password"], input[name="password"]').first().fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");
  await page.goto("/admin/managers", { waitUntil: "networkidle" });
  const count = await page.locator("form").count();
  console.log("FORM_COUNT", count);
  for (let i = 0; i < count; i++) {
    const form = await page.locator("form").nth(i).evaluate((f) => f.outerHTML);
    console.log(`FORM_${i}_START`);
    console.log(form.slice(0, 3000));
    console.log(`FORM_${i}_END`);
  }
});
