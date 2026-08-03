import { test, expect } from "@playwright/test";
import { ensureAdmin } from "../../packages/knowledge/admins";
import fs from "node:fs";

const ADMIN_EMAIL = "judge-explore8-admin@example.com";
const ADMIN_PASSWORD = "Judge-Explore8-Pass-1!";
const MGR_EMAIL = "judge-explore8-mgr@example.com";
const MGR_PASSWORD = "Judge-Explore8-Mgr-1!";

test("month view UI + find single-source day + day view UI", async ({ page }) => {
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

  // scan July 2026 for a single-source (incomplete) day and a complete day
  let singleSourceDate: string | null = null;
  let completeDate: string | null = null;
  for (let d = 1; d <= 31; d++) {
    const date = `2026-07-${String(d).padStart(2, "0")}`;
    const res = await page.request.get(`/api/metrics?location=orlando&period=day&date=${date}`);
    if (!res.ok()) continue;
    const json = await res.json();
    log.push(`${date}: status=${json.status} gotab=${json.gotabGrossCents} cr=${json.courtreserveGrossCents}`);
    if (json.status === "incomplete" && (json.gotabGrossCents === 0) !== (json.courtreserveGrossCents === 0) && !singleSourceDate) {
      singleSourceDate = date;
    }
    if (json.status === "complete" && !completeDate) {
      completeDate = date;
    }
  }
  log.push(`\nsingleSourceDate=${singleSourceDate} completeDate=${completeDate}`);

  // month view UI
  await page.goto("/dashboard/orlando?period=month&month=2026-08");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  log.push(`\n--- month view UI (2026-08) ---\n${await page.locator("body").innerText()}`);
  await page.screenshot({ path: "test-results/judge8-month-view.png", fullPage: true });

  await page.goto("/dashboard/orlando?period=month&month=2026-07");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  log.push(`\n--- month view UI (2026-07, full past month) ---\n${await page.locator("body").innerText()}`);

  if (completeDate) {
    await page.goto(`/dashboard/orlando?period=day&date=${completeDate}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    log.push(`\n--- day view UI (complete, ${completeDate}) ---\n${await page.locator("body").innerText()}`);
  }
  if (singleSourceDate) {
    await page.goto(`/dashboard/orlando?period=day&date=${singleSourceDate}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    log.push(`\n--- day view UI (incomplete/single-source, ${singleSourceDate}) ---\n${await page.locator("body").innerText()}`);
  }

  fs.writeFileSync("test-results/judge-explore8-log.txt", log.join("\n"));
});

test("august day breakdown", async ({ page }) => {
  const email2 = "judge-explore8b-admin@example.com";
  await ensureAdmin(email2, "Judge-Explore8b-Pass-1!");
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email2);
  await page.getByLabel("Password").fill("Judge-Explore8b-Pass-1!");
  await page.getByRole("button", { name: /sign in/i }).click();
  const mgr = "judge-explore8b-mgr@example.com";
  await page.getByLabel("Email").fill(mgr);
  await page.getByLabel("Temporary password").fill("Mgr-Pass-1!");
  await page.getByRole("radio", { name: /Crush Yard Orlando/i }).check();
  await page.getByRole("button", { name: /create manager/i }).click();
  await page.getByRole("button", { name: /log out/i }).click();
  await page.goto("/login");
  await page.getByLabel("Email").fill(mgr);
  await page.getByLabel("Password").fill("Mgr-Pass-1!");
  await page.getByRole("button", { name: /sign in/i }).click();

  const log: string[] = [];
  for (const d of ["2026-08-01", "2026-08-02", "2026-07-01", "2026-07-02", "2026-07-03"]) {
    const res = await page.request.get(`/api/metrics?location=orlando&period=day&date=${d}`);
    log.push(`${d}: ${JSON.stringify(await res.json())}`);
  }
  const monthRes = await page.request.get("/api/metrics?location=orlando&period=month&month=2026-08");
  log.push(`month 2026-08 full: ${JSON.stringify(await monthRes.json(), null, 2)}`);
  fs.writeFileSync("test-results/judge-explore8b-log.txt", log.join("\n"));
});
