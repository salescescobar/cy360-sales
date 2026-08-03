import { test } from "@playwright/test";
import fs from "fs";

const creds = JSON.parse(fs.readFileSync("tests/e2e/judge-fixtures/admin-credentials.json", "utf-8"));
const MGR_EMAIL = `judge-review-pii2-${Date.now()}@example.com`;
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

async function fullyExpand(page, lineName) {
  await page.goto("/dashboard/orlando?period=day&date=2026-08-01");
  await page.waitForLoadState("networkidle");
  for (let i = 0; i < 4; i++) {
    const row = page.locator("tbody tr", { hasText: lineName }).first();
    if (!(await row.count())) break;
    await row.click();
    await page.waitForTimeout(400);
  }
  const body = await page.evaluate(() => document.body.innerText);
  console.log(`EXPANDED [${lineName}]:\n` + body + "\n=====\n");
}

test("expand memberships and events for pii", async ({ page }) => {
  await loginMgr(page);
  await fullyExpand(page, "Memberships");
});

test("expand events for pii", async ({ page }) => {
  await loginMgr(page);
  await fullyExpand(page, "Events");
});

test("expand pickleball for pii", async ({ page }) => {
  await loginMgr(page);
  await fullyExpand(page, "Pickleball Revenue");
});
