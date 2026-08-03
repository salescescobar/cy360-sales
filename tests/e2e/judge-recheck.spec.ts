import { test, expect } from "@playwright/test";
import { ensureAdmin } from "../../packages/knowledge/admins";
import fs from "node:fs";

const ADMIN_EMAIL = "judge-recheck-admin@example.com";
const ADMIN_PASSWORD = "Judge-Recheck-Pass-1!";
const MGR_EMAIL = "judge-recheck-mgr@example.com";
const MGR_PASSWORD = "Judge-Recheck-Mgr-1!";

test("recheck bugs still present", async ({ page }) => {
  await ensureAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);
  const log: string[] = [];
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

  const r1 = await page.request.get("/api/metrics?location=orlando&period=day&date=2026-08-02");
  log.push(`today: ${await r1.text()}`);
  const r2 = await page.request.get("/api/metrics?location=orlando&period=month&month=2026-08");
  log.push(`month: ${await r2.text()}`);
  const r3 = await page.request.get("/api/metrics?location=orlando&period=day&date=2026-07-02");
  log.push(`incomplete single-source day: ${await r3.text()}`);

  fs.writeFileSync("test-results/judge-recheck.txt", log.join("\n\n"));
});
