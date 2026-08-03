import { test, expect } from "@playwright/test";

test("incomplete period labelling - fresh manager session", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel(/email/i).fill("judge-admin@cy360-sales.test");
  await page.getByLabel(/password/i).fill("judge correct horse battery staple");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  const email = `judge-incomplete-${Date.now()}@example.com`;
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

  await page.goto("/dashboard/orlando?period=month&month=2026-08");
  await page.waitForLoadState("networkidle").catch(() => {});
  console.log("CURRENT_MONTH_BODY", await page.locator("body").innerText());

  // a month with zero data anywhere - far future
  await page.goto("/dashboard/orlando?period=month&month=2027-01");
  await page.waitForLoadState("networkidle").catch(() => {});
  console.log("FUTURE_MONTH_BODY", await page.locator("body").innerText());
});
