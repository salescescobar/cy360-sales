import { test } from "@playwright/test";
import fs from "fs";

const creds = JSON.parse(fs.readFileSync("tests/e2e/judge-fixtures/admin-credentials.json", "utf-8"));

test("inspect business-lines filter form html", async ({ page }) => {
  await page.goto("/admin/login");
  await page.locator('input[name="email"]').first().fill(creds.email);
  await page.locator('input[name="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle");

  await page.goto("/admin/business-lines");
  await page.waitForLoadState("networkidle");
  const forms = await page.locator("form").all();
  for (let i = 0; i < forms.length; i++) {
    console.log(`FORM_${i}:\n` + await forms[i].innerHTML());
  }
  const inputs = await page.locator("input").evaluateAll((els) =>
    els.map((e) => ({ name: e.getAttribute("name"), type: e.getAttribute("type"), value: (e as HTMLInputElement).value }))
  );
  console.log("INPUTS", JSON.stringify(inputs, null, 2));
});
