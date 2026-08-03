import { test, expect } from "@playwright/test";
import { ensureAdmin } from "../../packages/knowledge/admins";
import fs from "node:fs";

const ADMIN_EMAIL = "judge-explore6-admin@example.com";
const ADMIN_PASSWORD = "Judge-Explore6-Pass-1!";

test("explore bad file handling", async ({ page }) => {
  await ensureAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);
  const log: string[] = [];
  async function snap(name: string) {
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/judge6-${name}.png`, fullPage: true });
    log.push(`--- ${name} ---\nURL: ${page.url()}\n${(await page.locator("body").innerText())}\n`);
  }

  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin\/managers$/);

  await page.goto("/import");
  const fileInput = page.locator('input[type="file"]');

  await fileInput.setInputFiles("tests/e2e/judge-fixtures/malformed.csv");
  await page.getByRole("button", { name: /preview/i }).click();
  await snap("malformed-result");

  await page.goto("/import");
  await fileInput.setInputFiles("tests/e2e/judge-fixtures/empty.csv");
  await page.getByRole("button", { name: /preview/i }).click();
  await snap("empty-result");

  fs.writeFileSync("test-results/judge-explore6-log.txt", log.join("\n\n"));
});
