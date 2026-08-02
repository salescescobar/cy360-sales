import { test, expect } from "@playwright/test";

function uniqueEmail(tag: string) {
  return `judge_${tag}_${Date.now()}_${Math.floor(Math.random() * 100000)}@example.com`;
}
const PASSWORD = "Judge#Passw0rd123";

test("main flow: day/month toggle, date nav, deep link, back button, double submit", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push("console: " + msg.text()); });

  const email = uniqueEmail("mainflow");
  await page.goto("/signup");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  const radios = page.locator('input[type="radio"]');
  if ((await radios.count()) > 0) await radios.first().check();
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForLoadState("load");
  console.log("DASHBOARD_URL: " + page.url());
  const btns = await page.locator("button").all();
  const btnTexts = [];
  for (const b of btns) btnTexts.push(await b.innerText());
  console.log("ALL_BUTTON_TEXTS: " + JSON.stringify(btnTexts));

  // click Month toggle
  await page.getByRole("button", { name: /^month$/i }).click();
  await page.waitForTimeout(1000);
  console.log("AFTER_MONTH_CLICK_URL: " + page.url());
  console.log("AFTER_MONTH_CLICK_BODY: " + JSON.stringify((await page.evaluate(() => document.body.innerText)).slice(0, 500)));

  // click Day toggle back
  await page.getByRole("button", { name: /^day$/i }).click();
  await page.waitForTimeout(1000);
  console.log("AFTER_DAY_CLICK_BODY: " + JSON.stringify((await page.evaluate(() => document.body.innerText)).slice(0, 500)));

  // change date via input[type=date]
  const dateInput = page.locator('input[type="date"]');
  if ((await dateInput.count()) > 0) {
    await dateInput.first().fill("2026-07-15");
    await page.waitForTimeout(1000);
    console.log("AFTER_DATE_CHANGE_URL: " + page.url());
    console.log("AFTER_DATE_CHANGE_BODY: " + JSON.stringify((await page.evaluate(() => document.body.innerText)).slice(0, 500)));
  } else {
    console.log("NO_DATE_INPUT_FOUND");
  }

  // back button behavior
  await page.goBack();
  await page.waitForTimeout(1000);
  console.log("AFTER_BACK_URL: " + page.url());
  console.log("AFTER_BACK_BODY: " + JSON.stringify((await page.evaluate(() => document.body.innerText)).slice(0, 300)));

  // deep link: open a brand new tab with same storage state (cookies) directly to an inner URL
  const newPage = await context.newPage();
  await newPage.goto("/dashboard/orlando?period=month&date=2026-08-01");
  await newPage.waitForLoadState("load");
  console.log("DEEPLINK_NEWTAB_URL: " + newPage.url());
  console.log("DEEPLINK_NEWTAB_BODY: " + JSON.stringify((await newPage.evaluate(() => document.body.innerText)).slice(0, 500)));
  await newPage.close();

  // double submit test: logout then rapid double click on login submit
  await page.getByRole("button", { name: /log out/i }).click();
  await page.waitForLoadState("load");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  const submitBtn = page.getByRole("button", { name: /sign in/i });
  await Promise.all([submitBtn.click(), submitBtn.click({ force: true }).catch(() => {})]);
  await page.waitForTimeout(1500);
  console.log("AFTER_DOUBLE_SUBMIT_URL: " + page.url());
  console.log("AFTER_DOUBLE_SUBMIT_BODY: " + JSON.stringify((await page.evaluate(() => document.body.innerText)).slice(0, 300)));

  console.log("ALL_ERRORS: " + JSON.stringify(errors));
});
