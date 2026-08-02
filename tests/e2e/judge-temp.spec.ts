import { test, expect } from "@playwright/test";

test("judge: home loads", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push("pageerror: " + err.message));

  const start = Date.now();
  const resp = await page.goto("/", { waitUntil: "load" });
  const loadTime = Date.now() - start;
  const title = await page.title();
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  await page.screenshot({ path: "test-results/judge-home.png", fullPage: true });

  console.log("JUDGE_RESULT:" + JSON.stringify({ status: resp?.status(), loadTime, title, bodyText, consoleErrors }));
});
