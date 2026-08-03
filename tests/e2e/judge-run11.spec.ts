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

test("hostile inputs", async ({ page, request }) => {
  test.setTimeout(180_000);
  await loginManager(page);

  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  // malformed dates
  for (const d of ["not-a-date", "2026-99-99", "0000-00-00", "'; DROP TABLE users;--", "%00", "2026-08-01T00:00:00Z"]) {
    const resp = await page.goto(`/dashboard/orlando?period=day&date=${encodeURIComponent(d)}`).catch((e:any) => ({ status: () => "nav-error:" + e.message }));
    const status = typeof resp === "object" && resp && "status" in resp ? (resp as any).status() : "err";
    const body = (await page.textContent("body").catch(() => "")) ?? "";
    log("malformed_date_" + d, { status, snip: body.slice(0, 200) });
  }

  // path traversal
  for (const p of ["/dashboard/orlando/day/..%2f..%2f..%2fetc%2fpasswd", "/dashboard/..%2Fadmin", "/../../etc/passwd", "/dashboard/orlando/day/2026-08-01/../../../etc/passwd"]) {
    const resp = await page.goto(p).catch((e:any) => null);
    const status = resp ? resp.status() : "nav-error";
    const body = (await page.textContent("body").catch(() => "")) ?? "";
    log("traversal_" + p, { status, url: page.url(), snip: body.slice(0, 200) });
  }

  // 10k char input in date param
  const longStr = "a".repeat(10000);
  const resp1 = await page.goto(`/dashboard/orlando?period=day&date=${longStr}`).catch((e:any) => null);
  const body1 = (await page.textContent("body").catch(() => "")) ?? "";
  log("10k_char_date", { status: resp1 ? resp1.status() : "nav-error", snip: body1.slice(0, 200) });

  log("console_errors_so_far", consoleErrors);

  // 10MB upload attempt on /import as admin
  await loginAdmin(page);
  await page.goto("/import");
  const big = Buffer.alloc(10 * 1024 * 1024, "a,b,c\n".repeat(1));
  fs.writeFileSync("/tmp/judge-big-upload.csv", big);
  const fileInput = page.locator('input[type="file"]').first();
  const fileInputCount = await fileInput.count();
  log("file_input_count", fileInputCount);
  if (fileInputCount > 0) {
    await fileInput.setInputFiles("/tmp/judge-big-upload.csv");
    const submitBtn = page.locator('button[type="submit"], button:has-text("Preview")').first();
    await submitBtn.click().catch((e:any) => log("upload_submit_err", String(e)));
    await page.waitForTimeout(3000);
    const body2 = (await page.textContent("body")) ?? "";
    log("after_10mb_upload", body2.slice(0, 800));
  }
  log("console_errors_final", consoleErrors);
});
