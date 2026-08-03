import { test, expect } from "@playwright/test";
import { ensureAdmin } from "../../packages/knowledge/admins";
import fs from "node:fs";

const ADMIN_EMAIL = "judge-explore7-admin@example.com";
const ADMIN_PASSWORD = "Judge-Explore7-Pass-1!";

test("reupload warning text", async ({ page }) => {
  await ensureAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);
  const log: string[] = [];
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin\/managers$/);

  // first upload for a fresh date
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles("tests/e2e/judge-fixtures/gotab-2023-05-05.csv");
  await page.getByRole("button", { name: /preview/i }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /confirm/i }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  log.push(`--- after first confirm ---\n${await page.locator("body").innerText()}`);

  // re-upload same date, different file
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles("tests/e2e/judge-fixtures/gotab-2023-05-05-v2.csv");
  await page.getByRole("button", { name: /preview/i }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  log.push(`--- reupload preview (should warn) ---\n${await page.locator("body").innerText()}`);
  await page.screenshot({ path: "test-results/judge7-reupload-preview.png", fullPage: true });

  fs.writeFileSync("test-results/judge-explore7-log.txt", log.join("\n\n"));
});
