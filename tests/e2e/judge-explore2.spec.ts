import { test } from "@playwright/test";

test("judge: dashboard deep dive", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push("pageerror: " + err.message));

  await page.goto("/");
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: /continue/i }).first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
  console.log("URL after login=" + page.url());

  // full HTML dump of body
  const html = await page.evaluate(() => document.body.innerHTML);
  console.log("HTML_LEN=" + html.length);
  console.log("HTML=" + html);

  console.log("CONSOLE_ERRORS=" + JSON.stringify(consoleErrors));
});
