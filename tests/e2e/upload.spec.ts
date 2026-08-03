import { test, expect, type Page } from "@playwright/test";
import { ensureAdmin } from "../../packages/knowledge/admins";

/** Acceptance test (spec #1 v2, section 6, "upload flow"): upload -> preview -> confirm ->
 *  value appears on the dashboard; malformed file rejected with a message; re-upload
 *  replaces instead of duplicating. */

const ADMIN_EMAIL = "e2e-admin-upload@example.com";
const ADMIN_PASSWORD = "correct horse battery staple admin";
const UPLOAD_DATE = "2026-07-10";

test.beforeAll(async () => {
  await ensureAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);
});

function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function adminLogin(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin\/managers$/);
}

async function provisionManager(page: Page, email: string, password: string): Promise<void> {
  await adminLogin(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Temporary password").fill(password);
  await page.getByRole("radio", { name: /Crush Yard Orlando/i }).check();
  await page.getByRole("button", { name: /create manager/i }).click();
  await expect(page).toHaveURL(/\/admin\/managers\?created=1$/);
  await page.getByRole("button", { name: /log out/i }).click();
}

test("upload -> preview -> confirm -> value appears on the dashboard; malformed file rejected; re-upload replaces", async ({ page }) => {
  const managerEmail = uniqueEmail("upload-manager");
  const managerPassword = "correct horse battery staple";
  await provisionManager(page, managerEmail, managerPassword);

  // --- malformed file: rejected with a specific message, nothing written ---
  await adminLogin(page);
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "garbage.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("not,a,recognized,format\n1,2,3,4\n"),
  });
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("alert")).toContainText(/unrecognized/i);
  await expect(page.getByRole("button", { name: /confirm/i })).toHaveCount(0);

  // --- upload -> preview -> confirm ---
  await page.locator('input[type="file"]').setInputFiles({
    name: "gotab-upload.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`date,category,gross_amount,transaction_count\n${UPLOAD_DATE},food,100.00,5\n`),
  });
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText(UPLOAD_DATE)).toBeVisible();
  // exact match: the plain total cell reads "$100.00", distinct from the breakdown cell's
  // "food: $100.00" (same figure, single category) — a bare substring match would hit both.
  await expect(page.getByRole("cell", { name: "$100.00", exact: true })).toBeVisible();
  await expect(page.getByText(/will replace/i)).toHaveCount(0); // first upload for this date — nothing to replace yet

  await page.getByRole("button", { name: /confirm.*write/i }).click();
  await expect(page.getByText(new RegExp(`Saved 1 day\\(s\\): ${UPLOAD_DATE}`))).toBeVisible();

  // Value appears on the manager's dashboard within the flow — no terminal involved.
  await page.goto("/login");
  await page.getByLabel("Email").fill(managerEmail);
  await page.getByLabel("Password").fill(managerPassword);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.getByRole("tab", { name: "Day" }).click();
  await page.locator('input[type="date"]').fill(UPLOAD_DATE);
  // "Total: $100.00" is unique — a GoTab-only day also shows "GoTab (F&B): $100.00" and
  // "food: $100.00" for the same figure, so the "Total:" prefix disambiguates.
  await expect(page.getByText("Total: $100.00")).toBeVisible();
  // GoTab only — CourtReserve hasn't been uploaded for this date — criterion #3: incomplete.
  await expect(page.getByText("Incomplete", { exact: false })).toBeVisible();

  // --- re-upload the same (location, date, source): replaces, never duplicates ---
  await adminLogin(page);
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "gotab-upload-corrected.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`date,category,gross_amount,transaction_count\n${UPLOAD_DATE},food,250.00,8\n`),
  });
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText(/will replace existing gotab data/i)).toBeVisible();

  await page.getByRole("button", { name: /confirm.*write/i }).click();
  await expect(page.getByText(new RegExp(`Replaced existing data for: ${UPLOAD_DATE}`))).toBeVisible();

  await page.goto(`/dashboard/orlando?period=day&date=${UPLOAD_DATE}`);
  await expect(page.getByText("Total: $250.00")).toBeVisible();
  await expect(page.getByText("Total: $100.00")).toHaveCount(0); // replaced, not summed alongside the old value
});
