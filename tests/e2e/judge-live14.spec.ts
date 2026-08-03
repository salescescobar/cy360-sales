import { test } from "@playwright/test";
import fs from "fs";

const creds = JSON.parse(fs.readFileSync("tests/e2e/judge-fixtures/admin-credentials.json", "utf-8"));
const MGR_EMAIL = `judge-review-guard2-${Date.now()}@example.com`;
const MGR_PASS = "reviewPass123!";

test("admin guard bodies - no session", async ({ page }) => {
  for (const path of ["/admin", "/admin/managers", "/admin/business-lines", "/admin/reconciliation", "/import"]) {
    const resp = await page.goto(path, { waitUntil: "networkidle" }).catch(() => null);
    const body = await page.evaluate(() => document.body.innerText.slice(0, 500));
    console.log("NOSESSION", path, "STATUS", resp?.status(), "URL", page.url(), "\nBODY:", body, "\n---");
  }
});

test("admin guard bodies - manager session", async ({ page }) => {
  await page.goto("/admin/login");
  await page.locator('input[name="email"]').first().fill(creds.email);
  await page.locator('input[name="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle");
  await page.goto("/admin/managers");
  await page.locator('input[name="email"]').first().fill(MGR_EMAIL);
  await page.locator('input[name="password"]').first().fill(MGR_PASS);
  await page.locator('input[type="radio"][value="orlando"]').check();
  await page.locator('button:has-text("Create manager")').click();
  await page.waitForLoadState("networkidle");
  await page.locator('a:has-text("Log out"), button:has-text("Log out")').first().click();
  await page.waitForLoadState("networkidle");

  await page.goto("/login");
  await page.locator('input[name="email"]').first().fill(MGR_EMAIL);
  await page.locator('input[name="password"]').first().fill(MGR_PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle");

  for (const path of ["/admin", "/admin/managers", "/admin/business-lines", "/admin/reconciliation", "/import"]) {
    const resp = await page.goto(path, { waitUntil: "networkidle" }).catch(() => null);
    const body = await page.evaluate(() => document.body.innerText.slice(0, 500));
    console.log("MGRSESSION", path, "STATUS", resp?.status(), "URL", page.url(), "\nBODY:", body, "\n---");
  }
});

test("hostile date inputs - wait for settle", async ({ page }) => {
  await page.goto("/admin/login");
  await page.locator('input[name="email"]').first().fill(creds.email);
  await page.locator('input[name="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle");
  await page.goto("/admin/managers");
  await page.locator('input[name="email"]').first().fill(MGR_EMAIL + "b");
  await page.locator('input[name="password"]').first().fill(MGR_PASS);
  await page.locator('input[type="radio"][value="orlando"]').check();
  await page.locator('button:has-text("Create manager")').click();
  await page.waitForLoadState("networkidle");
  await page.locator('a:has-text("Log out"), button:has-text("Log out")').first().click();
  await page.waitForLoadState("networkidle");
  await page.goto("/login");
  await page.locator('input[name="email"]').first().fill(MGR_EMAIL + "b");
  await page.locator('input[name="password"]').first().fill(MGR_PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle");

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE:" + m.text()); });

  for (const u of [
    "/dashboard/orlando?period=day&date=not-a-date",
    "/dashboard/orlando?period=day&date=2026-99-99",
  ]) {
    await page.goto(u, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(4000);
    const body = await page.evaluate(() => document.body.innerText.slice(0, 500));
    console.log("HOSTILE_SETTLED", u, "\nBODY:", body, "\n---");
  }
  console.log("ERRORS", JSON.stringify(errors));
});
