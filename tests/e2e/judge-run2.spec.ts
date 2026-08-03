import { test } from "@playwright/test";

const log = (k: string, v: any) => console.log("RESULT " + k + " " + JSON.stringify(v));

test("preauth guards", async ({ page }) => {
  test.setTimeout(60_000);
  for (const path of ["/import", "/admin", "/admin/reconciliation", "/admin/managers", "/admin/business-lines", "/signup", "/register"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle").catch(() => {});
    const body = (await page.textContent("body")) ?? "";
    log(path, { finalUrl: page.url(), bodySnippet: body.slice(0, 300) });
  }
});
