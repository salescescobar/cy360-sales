import { test, expect } from "@playwright/test";
import path from "path";

const ADMIN_EMAIL = "judge-admin@cy360-sales.test";
const ADMIN_PASSWORD = "judge correct horse battery staple";

async function loginAdmin(page: any) {
  await page.goto("/admin/login", { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').first().fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");
}

test("upload flow: preview then confirm, then dashboard shows totals", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/import", { waitUntil: "networkidle" });
  await page.screenshot({ path: ".judge-tests/shots/import-page.png", fullPage: true });
  console.log("IMPORT_PAGE_BODY", JSON.stringify((await page.locator("body").innerText()).slice(0, 1000)));

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.join(__dirname, "..", "files", "good.csv"));
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  const previewBtn = page.getByRole("button", { name: /^preview$/i });
  const previewBtnCount = await previewBtn.count();
  console.log("PREVIEW_BTN_COUNT", previewBtnCount);
  if (previewBtnCount > 0) {
    await previewBtn.first().click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
  }
  const previewBody = await page.locator("body").innerText();
  console.log("PREVIEW_BODY", JSON.stringify(previewBody.slice(0, 2000)));
  await page.screenshot({ path: ".judge-tests/shots/import-preview-good.png", fullPage: true });

  // look for confirm button
  const confirmBtn = page.getByRole("button", { name: /confirm/i });
  const confirmCount = await confirmBtn.count();
  console.log("CONFIRM_BTN_COUNT", confirmCount);
  if (confirmCount > 0) {
    await confirmBtn.first().click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    const afterConfirm = await page.locator("body").innerText();
    console.log("AFTER_CONFIRM_BODY", JSON.stringify(afterConfirm.slice(0, 1500)));
    await page.screenshot({ path: ".judge-tests/shots/import-after-confirm.png", fullPage: true });
  }

  // now check dashboard for that date as the MANAGER (separate session)
  const mgrPage = await page.context().browser()!.newPage();
  await mgrPage.goto("/login", { waitUntil: "networkidle" });
  await mgrPage.locator('input[type="email"]').first().fill("judge-run2-orlando@example.com");
  await mgrPage.locator('input[type="password"]').first().fill("JudgeRun2Orlando!23");
  await mgrPage.getByRole("button", { name: /sign in/i }).click();
  await mgrPage.waitForLoadState("networkidle");
  await mgrPage.goto("/dashboard/orlando?period=day&date=2026-07-15", { waitUntil: "networkidle" });
  const dashBody = await mgrPage.locator("body").innerText();
  console.log("DASHBOARD_AFTER_UPLOAD", JSON.stringify(dashBody.slice(0, 1500)));
  await mgrPage.screenshot({ path: ".judge-tests/shots/dashboard-day-2026-07-15.png", fullPage: true });
  await mgrPage.close();
});
