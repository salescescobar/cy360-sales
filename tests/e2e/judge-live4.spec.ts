import { test } from "@playwright/test";
import fs from "fs";

const creds = JSON.parse(fs.readFileSync("tests/e2e/judge-fixtures/admin-credentials.json", "utf-8"));

test("inspect manager creation form", async ({ page }) => {
  await page.goto("/admin/login");
  await page.locator('input[type="email"]').first().fill(creds.email);
  await page.locator('input[type="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle");

  await page.goto("/admin/managers");
  const forms = await page.locator("form").all();
  for (let i = 0; i < forms.length; i++) {
    const html = await forms[i].innerHTML();
    console.log(`FORM_${i}_HTML:\n` + html + "\n---");
  }
});
