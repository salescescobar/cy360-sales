import { test, expect } from "@playwright/test";
import { writeDay } from "../../packages/knowledge/index";
import { upsertFlag } from "../../packages/knowledge/dataQuality";
import { ensureAdmin } from "../../packages/knowledge/admins";

/**
 * The report's whole value proposition is trustworthy figures — a period with an unresolved
 * error-severity data-quality flag must NEVER render as if the numbers are final. This proves
 * the banner actually reaches the manager-facing dashboard, not just the admin flag list.
 */
const ORLANDO = "orlando";

function uniqueTestDate(): string {
  const seed = Date.now() + Math.floor(Math.random() * 1e6);
  const year = 1800 + (seed % 200); // wide historical range — never collides with real data
  const month = 1 + (Math.floor(seed / 200) % 12);
  const day = 1 + (Math.floor(seed / 2400) % 28);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const FLAG_DATE = uniqueTestDate();

const ADMIN_EMAIL = "e2e-dq-admin@example.com";
const ADMIN_PASSWORD = "correct horse battery staple admin";

function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

test.beforeAll(async () => {
  await ensureAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);
  await writeDay(ORLANDO, FLAG_DATE, [
    { locationSlug: ORLANDO, date: FLAG_DATE, source: "gotab", grossAmountCents: 500000, breakdown: { food: 500000 } },
  ]);
  await upsertFlag({
    locationSlug: ORLANDO, scope: "day", date: FLAG_DATE, source: "gotab",
    code: "unverified_day", severity: "error",
    message: `gotab sales for ${FLAG_DATE} could not be re-verified — e2e fixture flag`,
  });
});

test("a report period with an unresolved error flag renders the honesty banner, never silently as final", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin\/managers$/);

  const email = uniqueEmail("dq-manager");
  const password = "correct horse battery staple";
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Temporary password").fill(password);
  await page.getByRole("radio", { name: /Crush Yard Orlando/i }).check();
  await page.getByRole("button", { name: /create manager/i }).click();
  await expect(page).toHaveURL(/\/admin\/managers\?created=1$/);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/orlando(\?|$)/);

  await page.getByRole("tab", { name: "Day" }).click();
  await page.locator('input[type="date"]').fill(FLAG_DATE);

  await expect(page.getByRole("alert").filter({ hasText: "These figures may be wrong" })).toBeVisible();
  await expect(page.getByText(FLAG_DATE)).toBeVisible();
});
