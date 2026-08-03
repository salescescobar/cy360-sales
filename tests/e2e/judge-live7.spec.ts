import { test, type Page } from "@playwright/test";
import fs from "fs";

const creds = JSON.parse(fs.readFileSync("tests/e2e/judge-fixtures/admin-credentials.json", "utf-8"));
const MGR_EMAIL = `judge-review-drill2-${Date.now()}@example.com`;
const MGR_PASS = "reviewPass123!";

async function loginAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.locator('input[name="email"]').first().fill(creds.email);
  await page.locator('input[name="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle");
}

test("inspect dashboard DOM for links", async ({ page }) => {
  await loginAdmin(page);
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

  await page.goto("/dashboard/orlando?period=day&date=2026-08-01");
  await page.waitForLoadState("networkidle");

  const links = await page.locator("a").evaluateAll((els) =>
    els.map((e) => ({ href: e.getAttribute("href"), text: e.textContent?.trim().slice(0, 60) }))
  );
  console.log("ALL_LINKS", JSON.stringify(links, null, 2));

  const buttons = await page.locator("button").evaluateAll((els) =>
    els.map((e) => ({ text: e.textContent?.trim().slice(0, 60), onclick: !!e.onclick }))
  );
  console.log("ALL_BUTTONS", JSON.stringify(buttons, null, 2));

  // check table row markup
  const rowsHtml = await page.locator("table").first().innerHTML();
  console.log("TABLE_HTML_SNIPPET:\n" + rowsHtml.slice(0, 3000));
});
