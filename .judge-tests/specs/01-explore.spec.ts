import { test, expect } from "@playwright/test";

test("dashboard load time + console errors, and /login page", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push("pageerror: " + err.message));

  const start = Date.now();
  const resp = await page.goto("/", { waitUntil: "networkidle" });
  const elapsed = Date.now() - start;
  console.log("ROOT_STATUS", resp?.status(), "URL_AFTER", page.url());
  console.log("ROOT_LOAD_MS", elapsed);
  await page.screenshot({ path: ".judge-tests/shots/root.png", fullPage: true });
  console.log("ROOT_CONSOLE_ERRORS", JSON.stringify(consoleErrors));

  // login page
  const loginResp = await page.goto("/login", { waitUntil: "networkidle" });
  console.log("LOGIN_STATUS", loginResp?.status(), "URL", page.url());
  await page.screenshot({ path: ".judge-tests/shots/login.png", fullPage: true });
  const bodyText = await page.locator("body").innerText();
  console.log("LOGIN_BODY", JSON.stringify(bodyText.slice(0, 2000)));
  const html = await page.content();
  const hasSignupLink = /sign\s*up|signup|register|create account/i.test(bodyText);
  console.log("LOGIN_HAS_SIGNUP_TEXT", hasSignupLink);
  const links = await page.locator("a").evaluateAll((els) => els.map((e) => ({ text: e.textContent, href: (e as HTMLAnchorElement).href })));
  console.log("LOGIN_LINKS", JSON.stringify(links));
});

test("admin login page and /admin, /import guarded with no session", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

  const r1 = await page.goto("/admin/login", { waitUntil: "networkidle" });
  console.log("ADMIN_LOGIN_STATUS", r1?.status(), page.url());
  await page.screenshot({ path: ".judge-tests/shots/admin-login.png", fullPage: true });
  console.log("ADMIN_LOGIN_BODY", JSON.stringify((await page.locator("body").innerText()).slice(0, 1000)));

  const r2 = await page.goto("/admin", { waitUntil: "networkidle" });
  console.log("ADMIN_NOSESSION_STATUS", r2?.status(), "URL_AFTER", page.url());
  await page.screenshot({ path: ".judge-tests/shots/admin-nosession.png", fullPage: true });
  console.log("ADMIN_NOSESSION_BODY", JSON.stringify((await page.locator("body").innerText()).slice(0, 800)));

  const r3 = await page.goto("/import", { waitUntil: "networkidle" });
  console.log("IMPORT_NOSESSION_STATUS", r3?.status(), "URL_AFTER", page.url());
  await page.screenshot({ path: ".judge-tests/shots/import-nosession.png", fullPage: true });
  console.log("IMPORT_NOSESSION_BODY", JSON.stringify((await page.locator("body").innerText()).slice(0, 800)));

  console.log("CONSOLE_ERRORS", JSON.stringify(consoleErrors));
});

test("deep link to inner page with no session", async ({ page }) => {
  const r = await page.goto("/dashboard/2026-07-15", { waitUntil: "networkidle" }).catch((e) => { console.log("ERR", e.message); return null; });
  console.log("DEEPLINK_STATUS", r?.status(), "URL_AFTER", page.url());
  await page.screenshot({ path: ".judge-tests/shots/deeplink-nosession.png", fullPage: true });
  console.log("DEEPLINK_BODY", JSON.stringify((await page.locator("body").innerText()).slice(0, 800)));

  const r2 = await page.goto("/totally-not-a-real-page-xyz", { waitUntil: "networkidle" }).catch((e) => { console.log("ERR2", e.message); return null; });
  console.log("NOTFOUND_STATUS", r2?.status(), "URL_AFTER", page.url());
  await page.screenshot({ path: ".judge-tests/shots/notfound.png", fullPage: true });
  console.log("NOTFOUND_BODY", JSON.stringify((await page.locator("body").innerText()).slice(0, 800)));
});
