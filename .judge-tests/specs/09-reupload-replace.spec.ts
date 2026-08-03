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

test("reupload same date with different totals -> replace, warn, no duplication", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/import", { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(FIX("gotab-2023-05-05-v2.csv"));
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^preview$/i }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
  const preview = await page.locator("body").innerText();
  console.log("V2_PREVIEW", JSON.stringify(preview.slice(0, 1500)));
  const warnsReplace = /replace/i.test(preview);
  console.log("WARNS_REPLACE", warnsReplace);

  await page.getByRole("button", { name: /confirm/i }).first().click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  const mgrPage = await page.context().browser()!.newPage();
  await mgrPage.goto("/login", { waitUntil: "networkidle" });
  await mgrPage.locator('input[type="email"]').first().fill("judge-run2-orlando@example.com");
  await mgrPage.locator('input[type="password"]').first().fill("JudgeRun2Orlando!23");
  await mgrPage.getByRole("button", { name: /sign in/i }).click();
  await mgrPage.waitForLoadState("networkidle");
  await mgrPage.goto("/dashboard/orlando?period=day&date=2023-05-05", { waitUntil: "networkidle" });
  const dashBody = await mgrPage.locator("body").innerText();
  console.log("DASHBOARD_AFTER_V2", JSON.stringify(dashBody.slice(0, 1500)));
  await mgrPage.screenshot({ path: ".judge-tests/shots/dashboard-after-v2-replace.png", fullPage: true });
  // expect total to be 999+333 = 1332, NOT 700+999 or any duplicated sum
  await mgrPage.close();
});
