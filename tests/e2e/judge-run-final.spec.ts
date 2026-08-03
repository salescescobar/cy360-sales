import { test, expect } from "@playwright/test";
import fs from "node:fs";

const results: Record<string, any> = {};
const log = (k: string, v: any) => { results[k] = v; console.log("RESULT", k, JSON.stringify(v)); };

test("judge sweep", async ({ page, context, browser }) => {
  test.setTimeout(180_000);

  // ---- loads_fast ----
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  const t0 = Date.now();
  await page.goto("/", { waitUntil: "load" });
  const loadMs = Date.now() - t0;
  log("loads_fast", { loadMs, consoleErrors, url: page.url() });
  log("home_body", (await page.textContent("body"))?.slice(0, 500));

  // ---- no_signup ----
  await page.goto("/signup").catch(() => {});
  log("signup_url", page.url());
  await page.goto("/register").catch(() => {});
  log("register_url", page.url());

  // ---- admin_guarded (no session) ----
  await page.goto("/import");
  log("import_noauth_url", page.url());
  await page.goto("/admin");
  log("admin_noauth_url", page.url());
  await page.goto("/admin/reconciliation");
  log("reconciliation_noauth_url", page.url());

  // ---- admin login ----
  await page.goto("/admin/login");
  log("admin_login_url", page.url());
  log("admin_login_html_snippet", (await page.content()).slice(0, 2000));

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passInput = page.locator('input[type="password"], input[name="password"]').first();
  await emailInput.fill("judge-admin@cy360-sales.test");
  await passInput.fill("judge correct horse battery staple");
  await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
  log("admin_after_login_url", page.url());
  log("admin_after_login_body", (await page.textContent("body"))?.slice(0, 800));

  await page.goto("/admin");
  log("admin_page_url", page.url());
  log("admin_page_body", (await page.textContent("body"))?.slice(0, 1500));

  await page.goto("/admin/reconciliation");
  log("reconciliation_url", page.url());
  log("reconciliation_body", (await page.textContent("body"))?.slice(0, 2000));

  await page.goto("/admin/business-lines").catch(() => {});
  log("business_lines_admin_url", page.url());
  log("business_lines_admin_body", (await page.textContent("body"))?.slice(0, 2000));

  await page.goto("/admin/managers").catch(() => {});
  log("managers_url", page.url());
  log("managers_body", (await page.textContent("body"))?.slice(0, 2000));

  await page.goto("/import").catch(() => {});
  log("import_admin_url", page.url());
  log("import_admin_body", (await page.textContent("body"))?.slice(0, 1000));

  fs.mkdirSync("test-results/judge", { recursive: true });
  fs.writeFileSync("test-results/judge/results1.json", JSON.stringify(results, null, 2));
});
