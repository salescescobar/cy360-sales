import { test } from "@playwright/test";
import fs from "node:fs";

const log = (k: string, v: any) => console.log("RESULT " + k + " " + JSON.stringify(v));

test("manager flow", async ({ page, browser }) => {
  test.setTimeout(120_000);

  // admin login
  await page.goto("/admin/login");
  await page.locator('input[type="email"]').first().fill("judge-admin@cy360-sales.test");
  await page.locator('input[type="password"]').first().fill("judge correct horse battery staple");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle").catch(() => {});

  // create manager
  await page.goto("/admin/managers");
  const email = `finaljudge-mgr-${Date.now()}@example.com`;
  await page.locator('input[type="email"]').first().fill(email);
  const tempPassInput = page.locator('input[name="password"], input[type="password"]').first();
  let managerPassword = "";
  const passCount = await page.locator('input[type="password"]').count();
  log("password_field_count", passCount);
  if (passCount > 0) {
    managerPassword = "JudgeTempPass!2026";
    await page.locator('input[type="password"]').first().fill(managerPassword).catch(() => {});
  }
  await page.locator('input[type="radio"][value="orlando"]').first().check();
  await page.locator('button:has-text("Create manager")').first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
  const afterCreateBody = (await page.textContent("body")) ?? "";
  log("email_appears_in_list", afterCreateBody.includes(email));
  const idx = afterCreateBody.indexOf(email);
  log("snippet_around_email", afterCreateBody.slice(Math.max(0, idx - 200), idx + 200));
  fs.mkdirSync("test-results/judge", { recursive: true });
  fs.writeFileSync("test-results/judge/manager-create.html", await page.content());
  fs.writeFileSync("test-results/judge/manager-email.txt", email + "\n" + managerPassword);
});
