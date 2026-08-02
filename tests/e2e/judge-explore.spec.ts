import { test } from "@playwright/test";

test("judge: explore flow", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push("pageerror: " + err.message));

  await page.goto("/");
  console.log("STEP1 url=" + page.url());

  await page.getByRole("radio").first().check();
  const continueBtn = page.getByRole("button", { name: /continue/i }).first();
  await continueBtn.click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.screenshot({ path: "test-results/02b-after-continue.png", fullPage: true });
  console.log("STEP2 url=" + page.url());
  const bodyText2 = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log("STEP2 body=" + bodyText2);

  // dump all interactive elements
  const buttons = await page.getByRole("button").allTextContents();
  const links = await page.getByRole("link").allTextContents();
  const inputs = await page.locator("input").evaluateAll(els => els.map(e => ({type: (e as HTMLInputElement).type, name: (e as HTMLInputElement).name, placeholder: (e as HTMLInputElement).placeholder})));
  console.log("BUTTONS=" + JSON.stringify(buttons));
  console.log("LINKS=" + JSON.stringify(links));
  console.log("INPUTS=" + JSON.stringify(inputs));

  console.log("CONSOLE_ERRORS=" + JSON.stringify(consoleErrors));
});
