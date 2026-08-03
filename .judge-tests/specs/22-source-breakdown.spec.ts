import { test, expect } from "@playwright/test";

test("check business-lines month selector url pattern and try day-level param", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel(/email/i).fill("judge-admin@cy360-sales.test");
  await page.getByLabel(/password/i).fill("judge correct horse battery staple");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.goto("/admin/business-lines");
  await page.waitForLoadState("networkidle").catch(() => {});
  const select = page.locator("select").first();
  const options = await select.locator("option").allTextContents();
  console.log("MONTH_SELECT_OPTIONS_SAMPLE", JSON.stringify(options.slice(0, 10)));
  await select.selectOption({ label: "2026-08" }).catch(async () => {
    const vals = await select.locator("option").evaluateAll(els => els.map(e => e.getAttribute("value")));
    console.log("MONTH_SELECT_VALUES_SAMPLE", JSON.stringify(vals.slice(0, 10)));
  });
  await page.waitForLoadState("networkidle").catch(() => {});
  console.log("URL_AFTER_MONTH_SELECT", page.url());

  // try forcing a date param directly
  await page.goto("/admin/business-lines?location=orlando&month=2026-08&date=2026-08-01");
  await page.waitForLoadState("networkidle").catch(() => {});
  const body = await page.locator("body").innerText();
  console.log("FORCED_DATE_PARAM_BODY", body.slice(0, 2500));
});

test("reconciliation page url pattern for month select", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel(/email/i).fill("judge-admin@cy360-sales.test");
  await page.getByLabel(/password/i).fill("judge correct horse battery staple");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.goto("/admin/reconciliation");
  await page.waitForLoadState("networkidle").catch(() => {});
  console.log("RECON_URL", page.url());
  const html = await page.content();
  const formMatch = html.match(/<form[^>]*>[\s\S]{0,500}/);
  console.log("RECON_FORM_SNIPPET", formMatch ? formMatch[0] : "none");
});
