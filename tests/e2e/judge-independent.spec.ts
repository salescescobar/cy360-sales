import { test, expect } from "@playwright/test";
import fs from "node:fs";

const creds = JSON.parse(fs.readFileSync("tests/e2e/judge-fixtures/admin-credentials.json", "utf-8"));
const LOG = "test-results/judge-independent.txt";
function log(s: string) { fs.appendFileSync(LOG, s + "\n"); }

test.describe("judge-independent", () => {
  test("login page has no self-service signup link", async ({ page }) => {
    await page.goto("/login");
    const html = await page.content();
    const signupMatches = /sign\s*up|register|create.*account/i.test(await page.locator("body").innerText());
    log(`login page body text: ${(await page.locator("body").innerText()).replace(/\n/g, " | ")}`);
    const links = await page.locator("a").allTextContents();
    log(`login page links: ${JSON.stringify(links)}`);
    expect(links.some(l => /sign\s*up|register/i.test(l))).toBe(false);
  });

  test("admin provisions via real seeded credentials through the UI", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(creds.email);
    await page.getByLabel("Password").fill(creds.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/admin\/managers$/);
    const mgrEmail = `indep-mgr-${Math.floor(Math.random() * 1e9)}@example.com`;
    await page.getByLabel("Email").fill(mgrEmail);
    await page.getByLabel("Temporary password").fill("correct horse battery staple");
    await page.getByRole("radio", { name: /Crush Yard Orlando/i }).check();
    await page.getByRole("button", { name: /create manager/i }).click();
    await expect(page).toHaveURL(/created=1/);
    log(`admin provisioned manager: ${mgrEmail}`);
  });

  test("monthly like-for-like comparison", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(creds.email);
    await page.getByLabel("Password").fill(creds.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    const mgrEmail = `month-mgr-${Math.floor(Math.random() * 1e9)}@example.com`;
    await page.getByLabel("Email").fill(mgrEmail);
    await page.getByLabel("Temporary password").fill("correct horse battery staple");
    await page.getByRole("radio", { name: /Crush Yard Orlando/i }).check();
    await page.getByRole("button", { name: /create manager/i }).click();
    await page.getByRole("button", { name: /log out/i }).click();
    await page.goto("/login");
    await page.getByLabel("Email").fill(mgrEmail);
    await page.getByLabel("Password").fill("correct horse battery staple");
    await page.getByRole("button", { name: /sign in/i }).click();

    const res = await page.request.get("/api/metrics?location=orlando&period=month&month=2026-08");
    const json = await res.json();
    log(`month api 2026-08: ${JSON.stringify(json)}`);

    await page.goto("/dashboard/orlando?period=month&month=2026-08");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    const text = await page.locator("body").innerText();
    log(`month view UI: ${text.replace(/\n/g, " | ")}`);
  });

  test("empty state for date with no data", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(creds.email);
    await page.getByLabel("Password").fill(creds.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    const mgrEmail = `empty-mgr-${Math.floor(Math.random() * 1e9)}@example.com`;
    await page.getByLabel("Email").fill(mgrEmail);
    await page.getByLabel("Temporary password").fill("correct horse battery staple");
    await page.getByRole("radio", { name: /Crush Yard Orlando/i }).check();
    await page.getByRole("button", { name: /create manager/i }).click();
    await page.getByRole("button", { name: /log out/i }).click();
    await page.goto("/login");
    await page.getByLabel("Email").fill(mgrEmail);
    await page.getByLabel("Password").fill("correct horse battery staple");
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.goto("/dashboard/orlando?period=day&date=2019-01-01");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    const text = await page.locator("body").innerText();
    log(`empty state (2019-01-01): ${text.replace(/\n/g, " | ")}`);
  });

  test("back button after upload confirm", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(creds.email);
    await page.getByLabel("Password").fill(creds.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.goto("/import");
    await page.locator('input[type="file"]').setInputFiles("tests/e2e/judge-fixtures/gotab-2023-05-05.csv");
    await page.getByRole("button", { name: /preview/i }).click();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /confirm/i }).click();
    await page.waitForLoadState("networkidle");
    const afterConfirmUrl = page.url();
    await page.goBack();
    await page.waitForTimeout(300);
    const afterBackUrl = page.url();
    const afterBackText = await page.locator("body").innerText();
    log(`after confirm url: ${afterConfirmUrl}`);
    log(`after back url: ${afterBackUrl}`);
    log(`after back body: ${afterBackText.slice(0, 300).replace(/\n/g, " | ")}`);
  });

  test("refresh mid-flow preserves view and date", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(creds.email);
    await page.getByLabel("Password").fill(creds.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    const mgrEmail = `refresh-mgr-${Math.floor(Math.random() * 1e9)}@example.com`;
    await page.getByLabel("Email").fill(mgrEmail);
    await page.getByLabel("Temporary password").fill("correct horse battery staple");
    await page.getByRole("radio", { name: /Crush Yard Orlando/i }).check();
    await page.getByRole("button", { name: /create manager/i }).click();
    await page.getByRole("button", { name: /log out/i }).click();
    await page.goto("/login");
    await page.getByLabel("Email").fill(mgrEmail);
    await page.getByLabel("Password").fill("correct horse battery staple");
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.goto("/dashboard/orlando?period=month&month=2026-07");
    await page.waitForLoadState("networkidle");
    const beforeUrl = page.url();
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    const afterUrl = page.url();
    const afterText = await page.locator("body").innerText();
    log(`refresh mid-flow before: ${beforeUrl} after: ${afterUrl}`);
    log(`refresh mid-flow body: ${afterText.slice(0, 300).replace(/\n/g, " | ")}`);
  });
});
