import { test, expect } from "@playwright/test";

test("authenticated design screenshot", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel(/email/i).fill("judge-admin@cy360-sales.test");
  await page.getByLabel(/password/i).fill("judge correct horse battery staple");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  const email = `judge-shot-${Date.now()}@example.com`;
  const password = "judgepass123";
  await page.goto("/admin/managers");
  await page.getByLabel(/^email$/i).fill(email);
  await page.getByLabel(/temporary password/i).fill(password);
  await page.locator('input[type="radio"][value="orlando"]').check();
  await page.getByRole("button", { name: /create manager/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.goto("/dashboard/orlando?period=month&month=2026-07");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.screenshot({ path: ".judge-tests/shots/judge-live-design-2.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".judge-tests/shots/judge-live-mobile-2.png", fullPage: true });
});
