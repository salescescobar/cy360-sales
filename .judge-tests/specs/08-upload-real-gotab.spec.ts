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

async function loginManager(page: any) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').first().fill("judge-run2-orlando@example.com");
  await page.locator('input[type="password"]').first().fill("JudgeRun2Orlando!23");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");
}

test("upload real gotab csv fixture: preview + confirm + dashboard visible", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/import", { waitUntil: "networkidle" });

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(FIX("gotab-2023-05-05.csv"));
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^preview$/i }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
  const previewBody = await page.locator("body").innerText();
  console.log("GOTAB_PREVIEW_BODY", JSON.stringify(previewBody.slice(0, 2000)));
  await page.screenshot({ path: ".judge-tests/shots/gotab-preview.png", fullPage: true });

  const confirmBtn = page.getByRole("button", { name: /confirm/i });
  console.log("CONFIRM_COUNT", await confirmBtn.count());
  if (await confirmBtn.count()) {
    await confirmBtn.first().click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    console.log("AFTER_CONFIRM", JSON.stringify((await page.locator("body").innerText()).slice(0, 1000)));
  }
  await page.screenshot({ path: ".judge-tests/shots/gotab-after-confirm.png", fullPage: true });

  // Check as manager on dashboard, day view for 2023-05-05
  const mgrPage = await page.context().browser()!.newPage();
  await loginManager(mgrPage);
  await mgrPage.goto("/dashboard/orlando?period=day&date=2023-05-05", { waitUntil: "networkidle" });
  const dashBody = await mgrPage.locator("body").innerText();
  console.log("DASHBOARD_2023-05-05", JSON.stringify(dashBody.slice(0, 1500)));
  await mgrPage.screenshot({ path: ".judge-tests/shots/dashboard-2023-05-05-gotab-only.png", fullPage: true });
  await mgrPage.close();
});
