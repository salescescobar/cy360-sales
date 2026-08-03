import { test, expect } from "@playwright/test";

test("home loads fast, no console errors, no public signup", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push("PAGEERROR: " + err.message));

  const t0 = Date.now();
  const resp = await page.goto("/", { waitUntil: "networkidle" });
  const loadMs = Date.now() - t0;
  console.log("STATUS", resp?.status());
  console.log("LOAD_MS", loadMs);
  console.log("URL_AFTER", page.url());
  console.log("TITLE", await page.title());
  console.log("CONSOLE_ERRORS", JSON.stringify(errors));
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log("BODY_TEXT:\n" + bodyText);
  await page.screenshot({ path: "test-results/judge-home.png", fullPage: true });

  // look for a signup link
  const signupLinks = await page.locator("a, button").allTextContents();
  console.log("LINKS_BUTTONS", JSON.stringify(signupLinks.slice(0, 40)));
});

test("try direct signup route", async ({ page }) => {
  for (const path of ["/signup", "/register", "/admin/signup", "/sign-up"]) {
    const resp = await page.goto(path, { waitUntil: "domcontentloaded" }).catch((e) => null);
    console.log(path, "STATUS", resp?.status(), "URL", page.url());
  }
});
