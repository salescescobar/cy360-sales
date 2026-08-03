import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

const creds = JSON.parse(fs.readFileSync("tests/e2e/judge-fixtures/admin-credentials.json", "utf-8"));
const MGR_EMAIL = `judge-review-hostile-${Date.now()}@example.com`;
const MGR_PASS = "reviewPass123!";

test("10000-char date param settle time", async ({ page }) => {
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

  const longDate = "A".repeat(10000);
  const resp = await page.goto(`/dashboard/orlando?period=day&date=${longDate}`, { waitUntil: "domcontentloaded", timeout: 20000 }).catch((e) => ({ err: e.message }));
  console.log("LONGDATE_STATUS", (resp as any)?.status ? (resp as any).status() : JSON.stringify(resp));
  await page.waitForTimeout(6000);
  const body = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log("LONGDATE_BODY_AFTER_6S:", body);
});

test("10MB upload to import", async ({ page }) => {
  await page.goto("/admin/login");
  await page.locator('input[name="email"]').first().fill(creds.email);
  await page.locator('input[name="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle");
  await page.goto("/import");
  await page.waitForLoadState("networkidle");

  const bigPath = path.join("tests/e2e/judge-fixtures", "big-10mb.csv");
  const header = "date,item,amount\n";
  const row = "2026-01-01,Some Item,1.00\n";
  const target = 10 * 1024 * 1024;
  let content = header;
  while (content.length < target) content += row;
  fs.writeFileSync(bigPath, content);
  console.log("WROTE_FILE_SIZE", fs.statSync(bigPath).size);

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(bigPath);
  await page.waitForTimeout(1000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE:" + m.text()); });
  await page.locator('button:has-text("Preview")').click();
  await page.waitForTimeout(8000);
  const body = await page.evaluate(() => document.body.innerText.slice(0, 1200));
  console.log("AFTER_10MB_PREVIEW_CLICK_BODY:", body);
  console.log("ERRORS", JSON.stringify(errors));
  await page.screenshot({ path: "test-results/judge-10mb-upload.png", fullPage: true });
  fs.unlinkSync(bigPath);
});
