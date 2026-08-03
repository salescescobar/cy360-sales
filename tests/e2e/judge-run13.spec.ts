import { test } from "@playwright/test";

const log = (k: string, v: any) => console.log("RESULT " + k + " " + JSON.stringify(v));

async function loginAdmin(page: any) {
  await page.goto("/admin/login");
  await page.locator('input[type="email"]').first().fill("judge-admin@cy360-sales.test");
  await page.locator('input[type="password"]').first().fill("judge correct horse battery staple");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
}
async function loginManager(page: any) {
  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill("finaljudge-mgr-1785735838008@example.com");
  await page.locator('input[type="password"]').first().fill("JudgeTempPass!2026");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
}

test("pii sweep across pages", async ({ page }) => {
  test.setTimeout(180_000);
  await loginAdmin(page);

  // scan business-lines unmapped for several months
  const months = ["2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-07"];
  for (const m of months) {
    await page.goto("/admin/business-lines");
    await page.locator('input[type="month"]').first().fill(m);
    await page.waitForTimeout(500);
    const body = (await page.textContent("body")) ?? "";
    log("unmapped_" + m, body.includes("Nothing unmapped") ? "none" : body.slice(body.indexOf("Unmapped this period"), body.indexOf("Unmapped this period") + 800));
  }

  // scan reconciliation across months for name-like leak
  for (const m of ["2025-08", "2026-08"]) {
    await page.goto("/admin/reconciliation");
    const mi = page.locator('input[type="month"]').first();
    if (await mi.count() > 0) { await mi.fill(m); await page.waitForTimeout(700); }
    const body = (await page.textContent("body")) ?? "";
    log("reconciliation_scan_" + m, body.slice(0, 200));
  }

  await loginManager(page);
  // scan many days for transaction-level PII by expanding all groups
  for (const d of ["2026-07-15", "2026-06-01", "2025-09-10"]) {
    await page.goto(`/dashboard/orlando/day/${d}`);
    await page.waitForTimeout(600);
    const body = (await page.textContent("body")) ?? "";
    log("day_scan_" + d, body.slice(0, 600));
  }
});
