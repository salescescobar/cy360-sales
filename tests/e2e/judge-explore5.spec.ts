import { test } from "@playwright/test";

test("judge: hostile inputs + 404 page + xss", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push("pageerror: " + err.message));

  // 404 page content
  await page.goto("/nonexistent-page-xyz");
  const notFoundBody = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log("404_BODY=" + notFoundBody);
  await page.screenshot({ path: "test-results/04-404.png" });

  // log in
  await page.goto("/");
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: /continue/i }).first().click();
  await page.waitForLoadState("networkidle").catch(() => {});

  // XSS via URL path segment for location
  const xss = "<script>alert(1)</script>";
  const resp1 = await page.goto("/dashboard/" + encodeURIComponent(xss)).catch(e => null);
  console.log("XSS_PATH status=" + (resp1 ? resp1.status() : "ERR"));
  const xssBody = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log("XSS_PATH_BODY=" + xssBody);
  const xssHtmlHasScript = await page.evaluate(() => document.body.innerHTML.includes("<script>alert"));
  console.log("XSS_SCRIPT_INJECTED=" + xssHtmlHasScript);

  // huge / malformed date query param
  await page.goto("/dashboard/orlando");
  const longStr = "A".repeat(10000);
  const resp2 = await page.goto("/dashboard/orlando?date=" + longStr).catch(e => null);
  console.log("LONGSTR status=" + (resp2 ? resp2.status() : "ERR"));
  const longBody = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log("LONGSTR_BODY=" + longBody);

  // malformed date directly in input
  await page.goto("/dashboard/orlando");
  const resp3 = await page.request.get("/api/metrics?location=orlando&period=day&date=not-a-date");
  console.log("API_BAD_DATE status=" + resp3.status());
  const apiText = await resp3.text();
  console.log("API_BAD_DATE_BODY=" + apiText.slice(0, 500));

  const resp4 = await page.request.get("/api/metrics?location=<script>alert(1)</script>&period=day&date=2026-08-01");
  console.log("API_XSS_LOC status=" + resp4.status());
  console.log("API_XSS_LOC_BODY=" + (await resp4.text()).slice(0, 500));

  console.log("CONSOLE_ERRORS=" + JSON.stringify(consoleErrors));
});
