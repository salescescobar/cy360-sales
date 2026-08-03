import { test, expect } from "@playwright/test";
import { ensureAdmin } from "../../packages/knowledge/admins";
import fs from "node:fs";

const ADMIN_EMAIL = "judge-explore5-admin@example.com";
const ADMIN_PASSWORD = "Judge-Explore5-Pass-1!";
const MGR_EMAIL = "judge-explore5-mgr@example.com";
const MGR_PASSWORD = "Judge-Explore5-Mgr-1!";

test("check incomplete day + month math", async ({ page }) => {
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

  const r1 = await page.request.get("/api/metrics?location=orlando&period=day&date=2026-07-02");
  log.push(`--- api day 2026-07-02 (single-source day) ---\n${JSON.stringify(await r1.json(), null, 2)}`);

  const r2 = await page.request.get("/api/metrics?location=orlando&period=month&month=2026-08");
  log.push(`--- api month 2026-08 ---\n${JSON.stringify(await r2.json(), null, 2)}`);

  const r3 = await page.request.get("/api/metrics?location=orlando&period=day&date=2026-07-01");
  log.push(`--- api day 2026-07-01 (complete day) ---\n${JSON.stringify(await r3.json(), null, 2)}`);

  fs.writeFileSync("test-results/judge-explore5-log.txt", log.join("\n\n"));
});
