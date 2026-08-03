import { test, expect } from "@playwright/test";
import path from "path";

const ADMIN_EMAIL = "judge-admin@cy360-sales.test";
const ADMIN_PASSWORD = "judge correct horse battery staple";
const FIX = (f: string) => path.join(__dirname, "..", "..", "tests", "e2e", "judge-fixtures", f);

test("double click confirm - button disables to prevent duplicate writes", async ({ page }) => {
  await page.goto("/admin/login", { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').first().fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");

  await page.goto("/import", { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(FIX("gotab-2023-05-05.csv"));
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^preview$/i }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);

  const confirmBtn = page.getByRole("button", { name: /confirm/i }).first();
  // rapid double click without waiting for actionability between clicks
  await confirmBtn.dblclick({ force: true, delay: 0 }).catch((e) => console.log("DBLCLICK_ERR", e.message));
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1000);
  console.log("AFTER_DBLCLICK_BODY", JSON.stringify((await page.locator("body").innerText()).slice(0, 600)));

  const mgrPage = await page.context().browser()!.newPage();
  await mgrPage.goto("/login", { waitUntil: "networkidle" });
  await mgrPage.locator('input[type="email"]').first().fill("judge-run2-orlando@example.com");
  await mgrPage.locator('input[type="password"]').first().fill("JudgeRun2Orlando!23");
  await mgrPage.getByRole("button", { name: /sign in/i }).click();
  await mgrPage.waitForLoadState("networkidle");
  await mgrPage.goto("/dashboard/orlando?period=day&date=2023-05-05", { waitUntil: "networkidle" });
  const dashBody = await mgrPage.locator("body").innerText();
  console.log("DASHBOARD_AFTER_DBLCLICK", JSON.stringify(dashBody.slice(0, 600)));
  await mgrPage.close();
});
