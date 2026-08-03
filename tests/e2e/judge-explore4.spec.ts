import { test, expect } from "@playwright/test";
import { ensureAdmin } from "../../packages/knowledge/admins";
import fs from "node:fs";

const ADMIN_EMAIL = "judge-explore4-admin@example.com";
const ADMIN_PASSWORD = "Judge-Explore4-Pass-1!";
const MGR_EMAIL = "judge-explore4-mgr@example.com";
const MGR_PASSWORD = "Judge-Explore4-Mgr-1!";

test("re-check today reproducibility", async ({ page }) => {
  await ensureAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);
  const log: string[] = [];
  async function snap(name: string) {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    log.push(`--- ${name} ---\nURL: ${page.url()}\n${(await page.locator("body").innerText())}\n`);
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

  await page.goto("/dashboard/orlando?period=day&date=2026-08-02");
  await snap("today-1");
  await page.reload();
  await snap("today-2-reload");
  await page.reload();
  await snap("today-3-reload");

  // also hit the raw metrics API directly
  const res = await page.request.get("/api/metrics?location=orlando&period=day&date=2026-08-02");
  log.push(`--- api-today ---\n${JSON.stringify(await res.json(), null, 2)}\n`);
  const res2 = await page.request.get("/api/metrics?location=orlando&period=day&date=2026-08-02");
  log.push(`--- api-today-2 ---\n${JSON.stringify(await res2.json(), null, 2)}\n`);

  fs.writeFileSync("test-results/judge-explore4-log.txt", log.join("\n\n"));
});
