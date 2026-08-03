import { test } from "@playwright/test";
import fs from "node:fs";

const log = (k: string, v: any) => console.log("RESULT " + k + " " + JSON.stringify(v));

async function loginManager(page: any) {
  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill("finaljudge-mgr-1785735838008@example.com");
  await page.locator('input[type="password"]').first().fill("JudgeTempPass!2026");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
}
async function loginAdmin(page: any) {
  await page.goto("/admin/login");
  await page.locator('input[type="email"]').first().fill("judge-admin@cy360-sales.test");
  await page.locator('input[type="password"]').first().fill("judge correct horse battery staple");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
}

test("malformed date settle + upload response inspect", async ({ page }) => {
  test.setTimeout(180_000);
  await loginManager(page);
  page.on("pageerror", (e) => log("pageerror", String(e)));
  for (const d of ["not-a-date", "'; DROP TABLE users;--"]) {
    await page.goto(`/dashboard/orlando?period=day&date=${encodeURIComponent(d)}`);
    await page.waitForTimeout(2500);
    const body = (await page.textContent("body")) ?? "";
    log("settled_" + d, body.slice(0, 400));
  }

  // upload inspect
  await loginAdmin(page);
  await page.goto("/admin/managers");
  let body = (await page.textContent("body")) ?? "";
  log("admin_confirm_logged_in", body.slice(0, 60));

  await page.goto("/import");
  const big = Buffer.alloc(10 * 1024 * 1024, "a");
  fs.writeFileSync("/tmp/judge-big-upload.csv", big);
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles("/tmp/judge-big-upload.csv");

  const respPromise = page.waitForResponse((r: any) => r.request().method() === "POST", { timeout: 20000 }).catch(() => null);
  await page.locator('form:has(input[type="file"]) button[type="submit"]').first().click().catch((e:any) => log("submit_click_err", String(e)));
  const resp = await respPromise;
  log("upload_response", resp ? { status: resp.status(), url: resp.url() } : "no-post-seen");
  await page.waitForTimeout(1500);
  body = (await page.textContent("body")) ?? "";
  log("body_after_upload_2", body.slice(0, 600));

  await page.goto("/admin/managers");
  body = (await page.textContent("body")) ?? "";
  log("still_admin_after_upload", body.slice(0, 60));
});
