import { test } from "@playwright/test";
import { chromium } from "@playwright/test";

test("judge: load time + console errors on fresh load", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push("pageerror: " + err.message));
  page.on("requestfailed", (req) => consoleErrors.push("requestfailed: " + req.url() + " " + req.failure()?.errorText));

  const start = Date.now();
  await page.goto("/", { waitUntil: "load" });
  const loadTime = Date.now() - start;
  console.log("LOAD_TIME_MS=" + loadTime);
  console.log("CONSOLE_ERRORS=" + JSON.stringify(consoleErrors));
});

test("judge: throttled network shows loading state", async ({ page, context }) => {
  const client = await context.newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 400,
    downloadThroughput: (50 * 1024) / 8,
    uploadThroughput: (20 * 1024) / 8,
  });

  await page.goto("/");
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: /continue/i }).first().click();

  // immediately check for a loading indicator before network settles
  await page.waitForTimeout(200);
  const midBody = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log("MID_NAV_BODY=" + midBody);
  await page.screenshot({ path: "test-results/07-throttled-mid.png" });

  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  const finalBody = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log("FINAL_BODY=" + finalBody);
});
