import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "judge-admin@cy360-sales.test";
const ADMIN_PASSWORD = "judge correct horse battery staple";

async function adminLogin(page) {
  await page.goto("/admin/login");
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
}

test("exact gotab 2026-08-01 figure via manager dashboard", async ({ page }) => {
  // find or create orlando manager, log in, hit day view for 2026-08-01
  await adminLogin(page);
  const body = await page.locator("body").innerText();
  console.log("ADMIN_MANAGERS_AFTER_LOGIN", body.slice(0, 200));
  // grab an existing orlando manager email from the list
  const rows = await page.locator("table tr").allInnerTexts();
  console.log("MANAGER_ROWS", JSON.stringify(rows.slice(0, 5)));
});

test("day view 2026-08-01 gross figure - direct via existing manager session", async ({ page, context }) => {
  await adminLogin(page);
  // create a fresh manager for this check
  const email = `judge-figure-check-${Date.now()}@example.com`;
  const password = "judgepass123";
  await page.goto("/admin/managers");
  await page.getByLabel(/^email$/i).fill(email);
  await page.getByLabel(/temporary password/i).fill(password);
  await page.locator('input[type="radio"][value="orlando"]').check();
  await page.getByRole("button", { name: /create manager/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  // log out admin, log in as manager
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.goto("/dashboard/orlando?period=day&date=2026-08-01");
  await page.waitForLoadState("networkidle").catch(() => {});
  const body = await page.locator("body").innerText();
  console.log("DAY_2026-08-01", body);
});

test("drilldown from business line to group to item to transactions", async ({ page }) => {
  await page.goto("/dashboard/orlando?period=day&date=2026-07-25");
  await page.waitForLoadState("networkidle").catch(() => {});
  const body1 = await page.locator("body").innerText();
  console.log("STEP0_DAY_VIEW", body1.slice(0, 1500));
  // click on a business line row (e.g. the triangle/first line with data)
  const line = page.locator("text=Lessons & Classes").first();
  const clickable1 = await line.count();
  console.log("LESSONS_ROW_COUNT", clickable1);
  if (clickable1) {
    await line.click().catch(e => console.log("CLICK1_ERR", e.message));
    await page.waitForTimeout(500);
    const body2 = await page.locator("body").innerText();
    console.log("STEP1_AFTER_CLICK_LINE", body2.slice(0, 1500));
    console.log("URL_AFTER_STEP1", page.url());
    // try clicking a group/item within
    const groupCandidates = await page.locator("a, button, [role=button], tr").allInnerTexts();
    console.log("GROUP_CANDIDATES", JSON.stringify(groupCandidates.slice(0, 30)));
  }
});

test("admin business-lines page - unmapped assignment", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/business-lines");
  await page.waitForLoadState("networkidle").catch(() => {});
  const body = await page.locator("body").innerText();
  console.log("BUSINESS_LINES_PAGE_STATUS", page.url());
  console.log("BUSINESS_LINES_PAGE_BODY", body.slice(0, 3000));
  const selects = await page.locator("select").count();
  const forms = await page.locator("form").count();
  console.log("SELECT_COUNT", selects, "FORM_COUNT", forms);
});

test("admin reconciliation page", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/reconciliation");
  await page.waitForLoadState("networkidle").catch(() => {});
  const body = await page.locator("body").innerText();
  console.log("RECONCILIATION_PAGE_BODY", body.slice(0, 3000));
});

test("reconciliation and business-lines refuse manager session", async ({ page }) => {
  const email = `judge-guard-check-${Date.now()}@example.com`;
  const password = "judgepass123";
  await adminLogin(page);
  await page.goto("/admin/managers");
  await page.getByLabel(/^email$/i).fill(email);
  await page.getByLabel(/temporary password/i).fill(password);
  await page.locator('input[type="radio"][value="orlando"]').check();
  await page.getByRole("button", { name: /create manager/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.goto("/admin/reconciliation");
  console.log("RECON_AS_MANAGER", page.url(), (await page.locator("body").innerText()).slice(0, 300));
  await page.goto("/admin/business-lines");
  console.log("BIZLINES_AS_MANAGER", page.url(), (await page.locator("body").innerText()).slice(0, 300));
});

test("alerts and threshold indication on report", async ({ page }) => {
  await page.goto("/dashboard/orlando?period=day&date=2026-07-25");
  await page.waitForLoadState("networkidle").catch(() => {});
  const body = await page.locator("body").innerText();
  console.log("ALERTS_BODY_TOP", body.slice(0, 400));
});

test("incomplete period labelling on current month to date", async ({ page }) => {
  await page.goto("/dashboard/orlando?period=month&month=2026-08");
  await page.waitForLoadState("networkidle").catch(() => {});
  const body = await page.locator("body").innerText();
  console.log("CURRENT_MONTH_INCOMPLETE_CHECK", body);
});

test("design quality screenshot", async ({ page }) => {
  await page.goto("/dashboard/orlando?period=month&month=2026-07");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.screenshot({ path: ".judge-tests/shots/judge-live-design.png", fullPage: true });
  const bodyHtml = await page.content();
  console.log("HAS_INK_COLOR", bodyHtml.includes("#16181D"));
  console.log("HAS_ACCENT_COLOR", bodyHtml.includes("#E8503E"));
});

test("no member PII visible anywhere in UI text observed so far - grep check on preview/transactions", async ({ page }) => {
  await page.goto("/dashboard/orlando?period=day&date=2026-07-25");
  await page.waitForLoadState("networkidle").catch(() => {});
  const body = await page.locator("body").innerText();
  const suspiciousPatterns = /Member|FullName|FirstName|LastName/i;
  console.log("PII_PATTERN_MATCH_DAYVIEW", suspiciousPatterns.test(body));
});
