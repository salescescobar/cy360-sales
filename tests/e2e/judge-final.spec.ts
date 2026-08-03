import { test, expect, type Page } from "@playwright/test";
import { ensureAdmin } from "../../packages/knowledge/admins";
import fs from "node:fs";

function uniq(tag: string) {
  return `${tag}-${Math.floor(Math.random() * 1e9)}@example.com`;
}

async function loginAdmin(page: Page, email: string, password: string) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin\/managers$/);
}

async function createManager(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Temporary password").fill(password);
  await page.getByRole("radio", { name: /Crush Yard Orlando/i }).check();
  await page.getByRole("button", { name: /create manager/i }).click();
  await expect(page).toHaveURL(/created=1/);
}

test.describe("judge-final", () => {
  test("loads_fast: dashboard loads under 3s with no console errors", async ({ page }) => {
    const email = uniq("loadsfast-admin");
    const pass = "Judge-Pass-1!";
    await ensureAdmin(email, pass);
    const mgrEmail = uniq("loadsfast-mgr");
    await loginAdmin(page, email, pass);
    await createManager(page, mgrEmail, "correct horse battery staple");
    await page.getByRole("button", { name: /log out/i }).click();

    const errors: string[] = [];
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
    page.on("pageerror", (err) => errors.push(String(err)));

    await page.goto("/login");
    await page.getByLabel("Email").fill(mgrEmail);
    await page.getByLabel("Password").fill("correct horse battery staple");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/orlando/);

    const start = Date.now();
    await page.reload();
    await page.waitForLoadState("networkidle");
    const elapsed = Date.now() - start;
    fs.appendFileSync("test-results/judge-final-summary.txt", `loads_fast: elapsed=${elapsed}ms consoleErrors=${JSON.stringify(errors)}\n`);
    expect(elapsed).toBeLessThan(3000);
    expect(errors.length).toBe(0);
  });

  test("upload_flow + upload_visible + reupload_replaces + double submit", async ({ page }) => {
    const email = uniq("upload-admin");
    const pass = "Judge-Pass-1!";
    await ensureAdmin(email, pass);
    await loginAdmin(page, email, pass);

    await page.goto("/import");
    await page.locator('input[type="file"]').setInputFiles("tests/e2e/judge-fixtures/gotab-2023-05-05.csv");
    await page.getByRole("button", { name: /preview/i }).click();
    const bodyText1 = await page.locator("body").innerText();
    fs.appendFileSync("test-results/judge-final-summary.txt", `upload preview 1: ${bodyText1.replace(/\n/g, " | ")}\n`);
    expect(bodyText1).toContain("2023-05-05");
    expect(bodyText1).toContain("700.00");

    const confirmBtn = page.getByRole("button", { name: /confirm/i });
    // double-click test: fire two clicks rapidly
    await Promise.all([confirmBtn.click(), confirmBtn.click({ timeout: 500 }).catch(() => {})]);
    await page.waitForLoadState("networkidle");
    const afterConfirm = await page.locator("body").innerText();
    fs.appendFileSync("test-results/judge-final-summary.txt", `after confirm: ${afterConfirm.replace(/\n/g, " | ")}\n`);

    // check dashboard visibility as manager
    const mgrEmail = uniq("upload-mgr");
    await page.goto("/admin/managers");
    await createManager(page, mgrEmail, "correct horse battery staple");
    await page.getByRole("button", { name: /log out/i }).click();
    await page.goto("/login");
    await page.getByLabel("Email").fill(mgrEmail);
    await page.getByLabel("Password").fill("correct horse battery staple");
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.goto("/dashboard/orlando?period=day&date=2023-05-05");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    const dashText = await page.locator("body").innerText();
    fs.appendFileSync("test-results/judge-final-summary.txt", `dashboard after upload: ${dashText.replace(/\n/g, " | ")}\n`);
    expect(dashText).toContain("700.00");

    // check via metrics API for exact totals (double-submit duplication check)
    const res = await page.request.get("/api/metrics?location=orlando&period=day&date=2023-05-05");
    const json = await res.json();
    fs.appendFileSync("test-results/judge-final-summary.txt", `metrics after upload+doubleclick: ${JSON.stringify(json)}\n`);
    expect(json.totalGrossCents).toBe(70000);

    // re-upload same date with different amounts -> should warn + replace
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(pass);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.goto("/import");
    await page.locator('input[type="file"]').setInputFiles("tests/e2e/judge-fixtures/gotab-2023-05-05-v2.csv");
    await page.getByRole("button", { name: /preview/i }).click();
    const reuploadPreview = await page.locator("body").innerText();
    fs.appendFileSync("test-results/judge-final-summary.txt", `reupload preview: ${reuploadPreview.replace(/\n/g, " | ")}\n`);

    await page.getByRole("button", { name: /confirm/i }).click();
    await page.waitForLoadState("networkidle");

    const res2 = await page.request.get("/api/metrics?location=orlando&period=day&date=2023-05-05");
    const json2 = await res2.json();
    fs.appendFileSync("test-results/judge-final-summary.txt", `metrics after re-upload: ${JSON.stringify(json2)}\n`);
  });

  test("bad_file_rejected writes nothing", async ({ page }) => {
    const email = uniq("badfile-admin");
    const pass = "Judge-Pass-1!";
    await ensureAdmin(email, pass);
    await loginAdmin(page, email, pass);
    await page.goto("/import");
    await page.locator('input[type="file"]').setInputFiles("tests/e2e/judge-fixtures/malformed.csv");
    await page.getByRole("button", { name: /preview/i }).click();
    const text = await page.locator("body").innerText();
    fs.appendFileSync("test-results/judge-final-summary.txt", `bad file result: ${text.replace(/\n/g, " | ")}\n`);
    expect(text.toLowerCase()).toContain("unrecognized");
    expect(await page.getByRole("button", { name: /confirm/i }).count()).toBe(0);
  });

  test("location_isolation + admin_pages_guarded", async ({ page }) => {
    const email = uniq("iso-admin");
    const pass = "Judge-Pass-1!";
    await ensureAdmin(email, pass);
    await loginAdmin(page, email, pass);
    const mgrEmail = uniq("iso-mgr");
    await createManager(page, mgrEmail, "correct horse battery staple");
    await page.getByRole("button", { name: /log out/i }).click();

    await page.goto("/login");
    await page.getByLabel("Email").fill(mgrEmail);
    await page.getByLabel("Password").fill("correct horse battery staple");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/orlando/);

    await page.goto("/dashboard/nashville");
    const nashText = await page.locator("body").innerText();
    fs.appendFileSync("test-results/judge-final-summary.txt", `manager visits /dashboard/nashville: ${nashText.replace(/\n/g, " | ")}\n`);

    const apiRes = await page.request.get("/api/metrics?location=nashville&period=day&date=2026-07-01");
    fs.appendFileSync("test-results/judge-final-summary.txt", `manager api nashville status=${apiRes.status()} body=${await apiRes.text()}\n`);

    await page.goto("/import");
    const importText = await page.locator("body").innerText();
    fs.appendFileSync("test-results/judge-final-summary.txt", `manager visits /import: ${importText.replace(/\n/g, " | ")}\n`);

    await page.goto("/admin/managers");
    const adminText = await page.locator("body").innerText();
    fs.appendFileSync("test-results/judge-final-summary.txt", `manager visits /admin/managers: ${adminText.replace(/\n/g, " | ")}\n`);

    // no session at all
    await page.context().clearCookies();
    await page.goto("/import");
    const noSessionImport = await page.locator("body").innerText();
    fs.appendFileSync("test-results/judge-final-summary.txt", `no-session visits /import: ${noSessionImport.replace(/\n/g, " | ")}\n`);
    await page.goto("/admin/managers");
    const noSessionAdmin = await page.locator("body").innerText();
    fs.appendFileSync("test-results/judge-final-summary.txt", `no-session visits /admin/managers: ${noSessionAdmin.replace(/\n/g, " | ")}\n`);
  });

  test("hostile inputs: malformed date, path traversal, 10k chars, 10MB file", async ({ page }) => {
    const email = uniq("hostile-admin");
    const pass = "Judge-Pass-1!";
    await ensureAdmin(email, pass);
    await loginAdmin(page, email, pass);
    const mgrEmail = uniq("hostile-mgr");
    await createManager(page, mgrEmail, "correct horse battery staple");
    await page.getByRole("button", { name: /log out/i }).click();
    await page.goto("/login");
    await page.getByLabel("Email").fill(mgrEmail);
    await page.getByLabel("Password").fill("correct horse battery staple");
    await page.getByRole("button", { name: /sign in/i }).click();

    const cases = [
      "/api/metrics?location=orlando&period=day&date=not-a-date",
      "/api/metrics?location=orlando&period=day&date=" + encodeURIComponent("../../../etc/passwd"),
      "/api/metrics?location=orlando&period=day&date=" + "a".repeat(10000),
      "/api/metrics?location=" + encodeURIComponent("../../secret") + "&period=day&date=2026-07-01",
    ];
    for (const url of cases) {
      const res = await page.request.get(url, { failOnStatusCode: false });
      const status = res.status();
      let bodySnippet = "";
      try { bodySnippet = (await res.text()).slice(0, 300); } catch {}
      fs.appendFileSync("test-results/judge-final-summary.txt", `hostile ${url.slice(0,60)}... -> status=${status} body=${bodySnippet}\n`);
    }

    // 10MB file upload
    const big = Buffer.alloc(10 * 1024 * 1024, "a");
    fs.writeFileSync("tests/e2e/judge-fixtures/big.csv", "date,category,gross_amount,transaction_count\n" + big.toString());
    await page.goto("/import");
    await page.locator('input[type="file"]').setInputFiles("tests/e2e/judge-fixtures/big.csv");
    await page.getByRole("button", { name: /preview/i }).click().catch((e) => fs.appendFileSync("test-results/judge-final-summary.txt", `10MB preview click error: ${e}\n`));
    await page.waitForTimeout(1000);
    const bigFileText = await page.locator("body").innerText();
    fs.appendFileSync("test-results/judge-final-summary.txt", `10MB file result: ${bigFileText.slice(0,500).replace(/\n/g, " | ")}\n`);
  });

  test("responsive + deep link + stale session", async ({ page, context }) => {
    const email = uniq("resp-admin");
    const pass = "Judge-Pass-1!";
    await ensureAdmin(email, pass);
    await loginAdmin(page, email, pass);
    const mgrEmail = uniq("resp-mgr");
    await createManager(page, mgrEmail, "correct horse battery staple");
    await page.getByRole("button", { name: /log out/i }).click();
    await page.goto("/login");
    await page.getByLabel("Email").fill(mgrEmail);
    await page.getByLabel("Password").fill("correct horse battery staple");
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard/orlando?period=day&date=2026-07-01");
    await page.waitForTimeout(400);
    await page.screenshot({ path: "test-results/judge-final-mobile.png", fullPage: true });

    await page.setViewportSize({ width: 1440, height: 900 });

    // deep link to a nonsense inner page
    const res = await page.goto("/dashboard/orlando/some/deep/nonsense-page");
    fs.appendFileSync("test-results/judge-final-summary.txt", `deep link nonsense status=${res?.status()}\n`);
    const deepText = await page.locator("body").innerText();
    fs.appendFileSync("test-results/judge-final-summary.txt", `deep link body: ${deepText.slice(0,300).replace(/\n/g, " | ")}\n`);

    // stale session: clear cookies then visit dashboard
    await context.clearCookies();
    await page.goto("/dashboard/orlando");
    await page.waitForTimeout(300);
    const staleText = await page.locator("body").innerText();
    fs.appendFileSync("test-results/judge-final-summary.txt", `stale session dashboard: ${staleText.slice(0,300).replace(/\n/g, " | ")} url=${page.url()}\n`);
  });

  test("clear_errors: wrong password, unauth API", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nonexistent-user@example.com");
    await page.getByLabel("Password").fill("wrong-password-xyz");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForTimeout(300);
    const text = await page.locator("body").innerText();
    fs.appendFileSync("test-results/judge-final-summary.txt", `wrong login: ${text.replace(/\n/g, " | ")}\n`);

    const res = await page.request.get("/api/metrics?location=orlando&period=day&date=2026-07-01");
    fs.appendFileSync("test-results/judge-final-summary.txt", `unauth api status=${res.status()} body=${await res.text()}\n`);
  });
});
