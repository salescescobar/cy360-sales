import { test, expect } from "@playwright/test";
import { ensureAdmin } from "../../packages/knowledge/admins";
import fs from "node:fs";

const ADMIN_EMAIL = "judge-explore-admin@example.com";
const ADMIN_PASSWORD = "Judge-Explore-Pass-1!";

test("explore app structure", async ({ page, request, baseURL }) => {
  await ensureAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);
  const log: string[] = [];

  async function snap(name: string) {
    await page.screenshot({ path: `test-results/judge-${name}.png`, fullPage: true });
    log.push(`--- ${name} ---\nURL: ${page.url()}\n${(await page.textContent("body"))?.slice(0, 1500)}\n`);
  }

  await page.goto("/");
  await snap("root");

  await page.goto("/login");
  await snap("login");

  await page.goto("/admin/login");
  await snap("admin-login");

  // try signing in as admin
  const emailInput = page.getByLabel(/email/i);
  const passInput = page.getByLabel(/password/i);
  if (await emailInput.count()) {
    await emailInput.fill(ADMIN_EMAIL);
    await passInput.fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForLoadState("networkidle");
  }
  await snap("admin-after-login");

  await page.goto("/admin/managers");
  await snap("admin-managers");

  await page.goto("/import");
  await snap("admin-import");

  await page.goto("/dashboard");
  await snap("dashboard-as-admin");

  fs.writeFileSync("test-results/judge-explore-log.txt", log.join("\n\n"));
});
