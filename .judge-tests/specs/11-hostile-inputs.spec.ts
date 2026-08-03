import { test, expect } from "@playwright/test";

async function loginManager(page: any) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').first().fill("judge-run2-orlando@example.com");
  await page.locator('input[type="password"]').first().fill("JudgeRun2Orlando!23");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");
}

test("hostile inputs: malformed dates, path traversal, 10k char strings", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("pageerror:" + e.message));
  await loginManager(page);

  const cases = [
    "/dashboard/orlando?period=day&date=not-a-date",
    "/dashboard/orlando?period=day&date=2026-13-45",
    "/dashboard/orlando?period=day&date=" + encodeURIComponent("../../../etc/passwd"),
    "/dashboard/" + encodeURIComponent("../../etc/passwd"),
    "/dashboard/orlando?period=day&date=" + "9".repeat(10000),
    "/dashboard/" + "x".repeat(10000),
    "/dashboard/orlando?period=" + "y".repeat(10000) + "&date=2026-01-01",
    "/dashboard/orlando?period=day&date=<script>alert(1)</script>",
  ];

  for (const c of cases) {
    let status: number | undefined;
    let errMsg = "";
    try {
      const r = await page.goto(c, { waitUntil: "networkidle", timeout: 15000 });
      status = r?.status();
    } catch (e: any) {
      errMsg = e.message;
    }
    const body = await page.locator("body").innerText().catch(() => "<no body>");
    console.log("CASE", JSON.stringify(c.slice(0, 80)), "STATUS", status, "ERR", errMsg.slice(0,100), "BODY", JSON.stringify(body.slice(0, 300)));
  }

  console.log("PAGE_ERRORS", JSON.stringify(errors));
  await page.screenshot({ path: ".judge-tests/shots/hostile-last.png", fullPage: true });
});

test("hostile input in login form fields", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("pageerror:" + e.message));
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').first().fill("a".repeat(10000) + "@example.com");
  await page.locator('input[type="password"]').first().fill("p".repeat(10000));
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  const body = await page.locator("body").innerText();
  console.log("LOGIN_HOSTILE_RESULT", JSON.stringify(body.slice(0, 500)));
  console.log("PAGE_ERRORS", JSON.stringify(errors));
  await page.screenshot({ path: ".judge-tests/shots/hostile-login.png", fullPage: true });
});
