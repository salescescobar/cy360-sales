import { test, expect } from "@playwright/test";

const MGR_EMAIL = "judge-run2-orlando@example.com";
const MGR_PASSWORD = "JudgeRun2Orlando!23";

test("manager login, dashboard, isolation, admin-guard", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').first().fill(MGR_EMAIL);
  await page.locator('input[type="password"]').first().fill(MGR_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");
  console.log("AFTER_MGR_LOGIN_URL", page.url());
  const body = await page.locator("body").innerText();
  console.log("AFTER_MGR_LOGIN_BODY", JSON.stringify(body.slice(0, 1500)));
  await page.screenshot({ path: ".judge-tests/shots/mgr-dashboard.png", fullPage: true });

  const dashUrl = page.url();

  // try editing URL to another location slug
  const otherSlugs = ["miami", "austin", "dallas", "houston", "tampa"];
  for (const slug of otherSlugs) {
    const r = await page.goto(`/dashboard/${slug}`, { waitUntil: "networkidle" }).catch((e) => { console.log("NAVERR", slug, e.message); return null; });
    const b = await page.locator("body").innerText();
    console.log(`OTHER_LOC_${slug}`, r?.status(), JSON.stringify(b.slice(0, 200)));
  }

  // try admin pages as manager
  const rAdmin = await page.goto("/admin", { waitUntil: "networkidle" });
  console.log("MGR_ADMIN_STATUS", rAdmin?.status(), page.url());
  console.log("MGR_ADMIN_BODY", JSON.stringify((await page.locator("body").innerText()).slice(0, 500)));
  await page.screenshot({ path: ".judge-tests/shots/mgr-admin-blocked.png", fullPage: true });

  const rImport = await page.goto("/import", { waitUntil: "networkidle" });
  console.log("MGR_IMPORT_STATUS", rImport?.status(), page.url());
  console.log("MGR_IMPORT_BODY", JSON.stringify((await page.locator("body").innerText()).slice(0, 500)));
  await page.screenshot({ path: ".judge-tests/shots/mgr-import-blocked.png", fullPage: true });

  const rManagers = await page.goto("/admin/managers", { waitUntil: "networkidle" });
  console.log("MGR_ADMINMANAGERS_STATUS", rManagers?.status(), page.url());
  console.log("MGR_ADMINMANAGERS_BODY", JSON.stringify((await page.locator("body").innerText()).slice(0, 500)));

  console.log("DASH_URL_WAS", dashUrl);
  console.log("CONSOLE_ERRORS", JSON.stringify(consoleErrors));
});
