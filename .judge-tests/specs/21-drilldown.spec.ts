import { test, expect } from "@playwright/test";

async function managerLogin(page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("judge-run2-orlando@example.com");
  await page.getByLabel(/password/i).fill("wrongpass-will-check");
}

test("full day view detail page for 2026-08-01, follow Open day view link", async ({ page }) => {
  // try known manager creds from earlier runs; if fails, create a fresh one via admin
  await page.goto("/admin/login");
  await page.getByLabel(/email/i).fill("judge-admin@cy360-sales.test");
  await page.getByLabel(/password/i).fill("judge correct horse battery staple");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  const email = `judge-drill-${Date.now()}@example.com`;
  const password = "judgepass123";
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

  await page.goto("/dashboard/orlando?period=day&date=2026-08-01");
  await page.waitForLoadState("networkidle").catch(() => {});
  const link = page.getByRole("link", { name: /open day view/i });
  console.log("HAS_OPEN_DAY_VIEW_LINK", await link.count());
  if (await link.count()) {
    await link.click();
    await page.waitForLoadState("networkidle").catch(() => {});
  }
  console.log("URL_AFTER_OPEN_DAY_VIEW", page.url());
  const body = await page.locator("body").innerText();
  console.log("FULL_DAY_VIEW_BODY", body);

  // now try clicking a business-line row to drill into group -> item -> transactions
  const candidates = ["Food & Beverage", "Pickleball Revenue", "Unmapped", "Lessons & Classes"];
  for (const name of candidates) {
    const row = page.locator(`text=${name}`).first();
    if (await row.count()) {
      console.log("TRYING_CLICK", name);
      const before = page.url();
      await row.click({ trial: false }).catch(e => console.log("CLICK_ERR", name, e.message));
      await page.waitForTimeout(400);
      console.log("URL_AFTER_CLICK", name, page.url(), "CHANGED", page.url() !== before);
      const b2 = await page.locator("body").innerText();
      console.log("BODY_AFTER_CLICK", name, b2.slice(0, 1200));
      if (page.url() !== before) break;
    }
  }
});

test("month view Open day view link and per-line links generally", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel(/email/i).fill("judge-admin@cy360-sales.test");
  await page.getByLabel(/password/i).fill("judge correct horse battery staple");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  const email = `judge-drill2-${Date.now()}@example.com`;
  const password = "judgepass123";
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

  await page.goto("/dashboard/orlando?period=month&month=2026-07");
  await page.waitForLoadState("networkidle").catch(() => {});
  const allLinks = await page.locator("a").evaluateAll(els => els.map(e => ({ text: e.textContent, href: e.getAttribute("href") })));
  console.log("ALL_LINKS_MONTH_VIEW", JSON.stringify(allLinks));
  const rowLinks = await page.locator("tr a, tr button").evaluateAll(els => els.map(e => ({ tag: e.tagName, text: e.textContent, href: e.getAttribute("href") })));
  console.log("ROW_LINKS", JSON.stringify(rowLinks));
});
