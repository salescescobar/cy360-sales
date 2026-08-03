import { test } from "@playwright/test";

const log = (k: string, v: any) => console.log("RESULT " + k + " " + JSON.stringify(v));

test("authenticated load perf", async ({ page, context }) => {
  test.setTimeout(60_000);
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill("finaljudge-mgr-1785735838008@example.com");
  await page.locator('input[type="password"]').first().fill("JudgeTempPass!2026");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle").catch(() => {});

  const t0 = Date.now();
  await page.goto("/dashboard/orlando?period=month&month=2026-08", { waitUntil: "load" });
  const loadMs = Date.now() - t0;
  await page.waitForTimeout(500);
  log("dashboard_load_ms", loadMs);
  log("console_errors", consoleErrors);
});
