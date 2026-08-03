import { test, expect } from "@playwright/test";
import path from "path";

const ADMIN_EMAIL = "judge-admin@cy360-sales.test";
const ADMIN_PASSWORD = "judge correct horse battery staple";
const FIX = (f: string) => path.join(__dirname, "..", "..", "tests", "e2e", "judge-fixtures", f);

async function loginAdmin(page: any) {
  await page.goto("/admin/login", { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').first().fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");
}

test("double-click confirm does not duplicate", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/import", { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(FIX("gotab-2023-05-05.csv"));
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^preview$/i }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
  const confirmBtn = page.getByRole("button", { name: /confirm/i }).first();
  await Promise.all([confirmBtn.click(), confirmBtn.click({ force: true }).catch(() => {})]);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(800);
  const body = await page.locator("body").innerText();
  console.log("AFTER_DOUBLE_CLICK", JSON.stringify(body.slice(0, 800)));

  const mgrPage = await page.context().browser()!.newPage();
  await mgrPage.goto("/login", { waitUntil: "networkidle" });
  await mgrPage.locator('input[type="email"]').first().fill("judge-run2-orlando@example.com");
  await mgrPage.locator('input[type="password"]').first().fill("JudgeRun2Orlando!23");
  await mgrPage.getByRole("button", { name: /sign in/i }).click();
  await mgrPage.waitForLoadState("networkidle");
  await mgrPage.goto("/dashboard/orlando?period=day&date=2023-05-05", { waitUntil: "networkidle" });
  const dashBody = await mgrPage.locator("body").innerText();
  console.log("DASHBOARD_AFTER_DOUBLECLICK", JSON.stringify(dashBody.slice(0, 800)));
  await mgrPage.close();
});

test("stale/cleared session redirects to sign in with message", async ({ page, context }) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').first().fill("judge-run2-orlando@example.com");
  await page.locator('input[type="password"]').first().fill("JudgeRun2Orlando!23");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");
  console.log("LOGGED_IN_URL", page.url());

  await context.clearCookies();
  await page.goto("/dashboard/orlando?period=day&date=2026-08-02", { waitUntil: "networkidle" });
  console.log("AFTER_CLEAR_COOKIES_URL", page.url());
  const body = await page.locator("body").innerText();
  console.log("AFTER_CLEAR_COOKIES_BODY", JSON.stringify(body.slice(0, 500)));
  await page.screenshot({ path: ".judge-tests/shots/stale-session.png", fullPage: true });
});

test("responsive at 390px and desktop", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.screenshot({ path: ".judge-tests/shots/mobile-login.png", fullPage: true });

  await page.locator('input[type="email"]').first().fill("judge-run2-orlando@example.com");
  await page.locator('input[type="password"]').first().fill("JudgeRun2Orlando!23");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: ".judge-tests/shots/mobile-dashboard.png", fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard/orlando?period=month&month=2026-07", { waitUntil: "networkidle" });
  await page.screenshot({ path: ".judge-tests/shots/desktop-month.png", fullPage: true });
});

test("deep link to inner page while authenticated renders sensibly", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').first().fill("judge-run2-orlando@example.com");
  await page.locator('input[type="password"]').first().fill("JudgeRun2Orlando!23");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");
  const r = await page.goto("/dashboard/orlando?period=day&date=2026-07-25", { waitUntil: "networkidle" });
  console.log("DEEPLINK_AUTHED_STATUS", r?.status(), page.url());
  const body = await page.locator("body").innerText();
  console.log("DEEPLINK_AUTHED_BODY", JSON.stringify(body.slice(0, 500)));
});
