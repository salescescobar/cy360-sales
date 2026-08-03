import { test, expect } from "@playwright/test";
import { ensureAdmin } from "../../packages/knowledge/admins";
import fs from "node:fs";

const ADMIN_EMAIL = "judge-explore3-admin@example.com";
const ADMIN_PASSWORD = "Judge-Explore3-Pass-1!";
const MGR_EMAIL = "judge-explore3-mgr@example.com";
const MGR_PASSWORD = "Judge-Explore3-Mgr-1!";

test("explore dashboard", async ({ page }) => {
  await ensureAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);
  const log: string[] = [];
  async function snap(name: string) {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `test-results/judge3-${name}.png`, fullPage: true });
    log.push(`--- ${name} ---\nURL: ${page.url()}\n${(await page.locator("body").innerText())?.slice(0, 4000)}\n`);
  }

  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin\/managers$/);

  await page.getByLabel("Email").fill(MGR_EMAIL);
  await page.getByLabel("Temporary password").fill(MGR_PASSWORD);
  await page.getByRole("radio", { name: /Crush Yard Orlando/i }).check();
  await page.getByRole("button", { name: /create manager/i }).click();
  await page.getByRole("button", { name: /log out/i }).click();

  await page.goto("/login");
  await page.getByLabel("Email").fill(MGR_EMAIL);
  await page.getByLabel("Password").fill(MGR_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await snap("dashboard-default");

  await page.goto("/dashboard/orlando?period=day&date=2026-07-01");
  await snap("day-view-complete");

  await page.goto("/dashboard/orlando?period=day&date=2026-07-02");
  await snap("day-view-incomplete");

  await page.goto("/dashboard/orlando?period=month&date=2026-08-01");
  await snap("month-view-current");

  await page.goto("/dashboard/orlando?period=month&date=2026-07-01");
  await snap("month-view-july");

  fs.writeFileSync("test-results/judge-explore3-log.txt", log.join("\n\n"));
});
