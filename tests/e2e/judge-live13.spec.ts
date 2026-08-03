import { test } from "@playwright/test";
import fs from "fs";

const creds = JSON.parse(fs.readFileSync("tests/e2e/judge-fixtures/admin-credentials.json", "utf-8"));
const MGR_EMAIL = `judge-review-guard-${Date.now()}@example.com`;
const MGR_PASS = "reviewPass123!";

test("admin guard with no session", async ({ page }) => {
  for (const path of ["/admin", "/admin/managers", "/admin/business-lines", "/admin/reconciliation", "/import"]) {
    const resp = await page.goto(path, { waitUntil: "domcontentloaded" }).catch(() => null);
    console.log("NOSESSION", path, "STATUS", resp?.status(), "FINAL_URL", page.url());
  }
});

test("admin guard with manager session + location isolation + hostile inputs", async ({ page }) => {
  // create manager via admin
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
  console.log("MGR_LOGGED_IN_URL", page.url());

  for (const path of ["/admin", "/admin/managers", "/admin/business-lines", "/admin/reconciliation", "/import"]) {
    const resp = await page.goto(path, { waitUntil: "domcontentloaded" }).catch(() => null);
    console.log("MGRSESSION", path, "STATUS", resp?.status(), "FINAL_URL", page.url());
  }

  // location isolation
  for (const loc of ["nashville", "mt_pleasant", "../admin", "orlando/../nashville"]) {
    const resp = await page.goto(`/dashboard/${loc}`, { waitUntil: "domcontentloaded" }).catch((e) => ({ err: e.message }));
    console.log("LOC_ISOLATION", loc, "STATUS", resp?.status ? resp.status() : resp, "FINAL_URL", page.url());
    const body = await page.evaluate(() => document.body.innerText.slice(0, 300)).catch(() => "");
    console.log("BODY", body);
  }

  // hostile inputs: malformed date, path traversal, long input
  const hostileUrls = [
    "/dashboard/orlando?period=day&date=not-a-date",
    "/dashboard/orlando?period=day&date=" + "A".repeat(10000),
    "/dashboard/" + encodeURIComponent("../../etc/passwd"),
    "/dashboard/orlando?period=day&date=2026-99-99",
  ];
  for (const u of hostileUrls) {
    const resp = await page.goto(u, { waitUntil: "domcontentloaded", timeout: 15000 }).catch((e) => ({ err: e.message }));
    console.log("HOSTILE", u.slice(0, 80), "STATUS", resp?.status ? resp.status() : JSON.stringify(resp));
    const errs: string[] = [];
    page.once("pageerror", (e) => errs.push(e.message));
    const body = await page.evaluate(() => document.body.innerText.slice(0, 300)).catch((e) => "EVAL_ERR:" + e.message);
    console.log("BODY", body);
  }

  // stale session
  await page.context().clearCookies();
  const resp = await page.goto("/dashboard/orlando", { waitUntil: "domcontentloaded" }).catch(() => null);
  console.log("STALE_SESSION_URL", page.url(), "STATUS", resp?.status());
  const staleBody = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log("STALE_BODY", staleBody);

  // deep link no session
  const resp2 = await page.goto("/dashboard/orlando/day/2026-08-01", { waitUntil: "domcontentloaded" }).catch(() => null);
  console.log("DEEPLINK_URL", page.url(), "STATUS", resp2?.status());
  const deepBody = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log("DEEPLINK_BODY", deepBody);
});
