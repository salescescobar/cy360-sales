import { test, expect } from "@playwright/test";

test("judge: unauthenticated access + month tab + logout", async ({ page, context }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push("pageerror: " + err.message));

  // 1. Try direct nav to dashboard without any cookie
  await page.goto("/dashboard/orlando");
  console.log("DIRECT_NAV_URL=" + page.url());
  const bodyDirect = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log("DIRECT_NAV_BODY=" + bodyDirect);

  // 2. Now log in properly
  await page.goto("/");
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: /continue/i }).first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
  console.log("AFTER_LOGIN_URL=" + page.url());

  // 3. Click Month tab
  await page.getByRole("tab", { name: "Month" }).click();
  await page.waitForTimeout(500);
  const bodyMonth = await page.evaluate(() => document.body.innerText.slice(0, 1000));
  console.log("MONTH_BODY=" + bodyMonth);
  await page.screenshot({ path: "test-results/03-month.png", fullPage: true });

  // 4. Reload - does tab state / session persist?
  await page.reload();
  await page.waitForLoadState("networkidle").catch(() => {});
  console.log("AFTER_RELOAD_URL=" + page.url());
  const bodyReload = await page.evaluate(() => document.body.innerText.slice(0, 1000));
  console.log("AFTER_RELOAD_BODY=" + bodyReload);

  // 5. Try changing date to a different day
  await page.goto("/dashboard/orlando");
  const dateInput = page.locator('input[type="date"]');
  await dateInput.fill("2026-07-15");
  await page.waitForTimeout(500);
  const bodyDate = await page.evaluate(() => document.body.innerText.slice(0, 1000));
  console.log("DATE_CHANGE_BODY=" + bodyDate);

  // 6. Log out
  await page.getByRole("button", { name: /log out/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  console.log("AFTER_LOGOUT_URL=" + page.url());
  const bodyLogout = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log("AFTER_LOGOUT_BODY=" + bodyLogout);

  // 7. Try accessing dashboard again after logout
  await page.goto("/dashboard/orlando");
  console.log("AFTER_LOGOUT_DIRECT_NAV_URL=" + page.url());
  const bodyAfterLogoutNav = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log("AFTER_LOGOUT_DIRECT_NAV_BODY=" + bodyAfterLogoutNav);

  console.log("CONSOLE_ERRORS=" + JSON.stringify(consoleErrors));
});
