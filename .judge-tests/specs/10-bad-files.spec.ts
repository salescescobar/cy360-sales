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

test("malformed csv rejected", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loginAdmin(page);
  await page.goto("/import", { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(FIX("malformed.csv"));
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^preview$/i }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
  const body = await page.locator("body").innerText();
  console.log("MALFORMED_RESULT", JSON.stringify(body.slice(0, 1200)));
  await page.screenshot({ path: ".judge-tests/shots/malformed-result.png", fullPage: true });
  console.log("PAGE_ERRORS", JSON.stringify(errors));
});

test("empty csv rejected", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loginAdmin(page);
  await page.goto("/import", { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(FIX("empty.csv"));
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^preview$/i }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
  const body = await page.locator("body").innerText();
  console.log("EMPTY_RESULT", JSON.stringify(body.slice(0, 1200)));
  await page.screenshot({ path: ".judge-tests/shots/empty-result.png", fullPage: true });
  console.log("PAGE_ERRORS", JSON.stringify(errors));
});

test("huge 10MB csv handled without crash", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loginAdmin(page);
  await page.goto("/import", { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, "..", "files", "big.csv"));
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /^preview$/i }).click();
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch((e) => console.log("NETIDLE_TIMEOUT", e.message));
  await page.waitForTimeout(1000);
  const body = await page.locator("body").innerText();
  console.log("BIG_RESULT", JSON.stringify(body.slice(0, 1200)));
  await page.screenshot({ path: ".judge-tests/shots/big-result.png", fullPage: true });
  console.log("PAGE_ERRORS", JSON.stringify(errors));
});
