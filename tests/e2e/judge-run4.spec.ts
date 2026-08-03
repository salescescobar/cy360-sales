import { test } from "@playwright/test";
import fs from "node:fs";

const log = (k: string, v: any) => console.log("RESULT " + k + " " + JSON.stringify(v));

test("manager dashboard", async ({ page }) => {
  test.setTimeout(120_000);
  const email = "finaljudge-mgr-1785735838008@example.com";
  const password = "JudgeTempPass!2026";

  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
  log("after_manager_login_url", page.url());

  await page.waitForTimeout(1500);
  const body = (await page.textContent("body")) ?? "";
  log("dashboard_body_full", body);
  fs.writeFileSync("test-results/judge/dashboard.html", await page.content());
  await page.screenshot({ path: "test-results/judge/dashboard.png", fullPage: true });
});
