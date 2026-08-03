import { test, expect } from "@playwright/test";
import { ensureAdmin } from "../../packages/knowledge/admins";
import fs from "node:fs";

const ADMIN_EMAIL = "judge-explore2-admin@example.com";
const ADMIN_PASSWORD = "Judge-Explore2-Pass-1!";

test("explore upload flow", async ({ page }) => {
  await ensureAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);
  const log: string[] = [];
  async function snap(name: string) {
    await page.screenshot({ path: `test-results/judge2-${name}.png`, fullPage: true });
    log.push(`--- ${name} ---\nURL: ${page.url()}\n${(await page.textContent("body"))?.slice(0, 3000)}\n`);
  }

  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");

  await page.goto("/import");
  await snap("import-page");

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles("tests/e2e/judge-fixtures/gotab-2023-05-05.csv");
  await snap("import-file-selected");

  const previewBtn = page.getByRole("button", { name: /preview/i });
  if (await previewBtn.count()) {
    await previewBtn.click();
    await page.waitForLoadState("networkidle");
  }
  await snap("import-preview");

  fs.writeFileSync("test-results/judge-explore2-log.txt", log.join("\n\n"));
});
