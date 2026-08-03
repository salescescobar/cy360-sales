import { test, expect } from "@playwright/test";

test("console error sweep across key pages", async ({ page }) => {
  const errors: { url: string; msg: string }[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push({ url: page.url(), msg: msg.text() });
  });
  page.on("pageerror", (err) => errors.push({ url: page.url(), msg: "pageerror: " + err.message }));

  const pages = ["/login", "/admin/login"];
  for (const p of pages) {
    await page.goto(p, { waitUntil: "networkidle" });
  }

  await page.locator('input[type="email"]').first().fill("judge-run2-orlando@example.com");
  await page.locator('input[type="password"]').first().fill("JudgeRun2Orlando!23");
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').first().fill("judge-run2-orlando@example.com");
  await page.locator('input[type="password"]').first().fill("JudgeRun2Orlando!23");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");

  await page.goto("/dashboard/orlando?period=day&date=2026-07-25", { waitUntil: "networkidle" });
  await page.goto("/dashboard/orlando?period=month&month=2026-07", { waitUntil: "networkidle" });

  console.log("TOTAL_CONSOLE_ERRORS", errors.length);
  console.log("ERRORS", JSON.stringify(errors));
});
