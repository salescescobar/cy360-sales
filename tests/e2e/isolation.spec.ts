import { test, expect, type Page } from "@playwright/test";
import { ensureAdmin } from "../../packages/knowledge/admins";

/** Acceptance test (spec #1 v2, section 6, "isolation"): a manager cannot reach another
 *  location's data by editing the URL — neither the dashboard page nor the metrics API
 *  it calls (invariant #1: enforced by Supabase RLS, not only in the UI). */

const ADMIN_EMAIL = "e2e-admin-isolation@example.com";
const ADMIN_PASSWORD = "correct horse battery staple admin";

test.beforeAll(async () => {
  await ensureAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);
});

function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function provisionAndLoginManager(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin\/managers$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Temporary password").fill(password);
  await page.getByRole("radio", { name: /Crush Yard Orlando/i }).check();
  await page.getByRole("button", { name: /create manager/i }).click();
  await expect(page).toHaveURL(/\/admin\/managers\?created=1$/);

  // Clear the admin session before signing in as the manager — this browser context must
  // hold only a manager session afterward, or the admin-page checks below would trivially
  // pass on lingering admin cookies rather than actually enforcing invariant #5.
  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/orlando(\?|$)/);
}

test("Orlando manager cannot reach another location by editing the URL", async ({ page }) => {
  const email = uniqueEmail("isolation-manager");
  const password = "correct horse battery staple";
  await provisionAndLoginManager(page, email, password);

  // Page-level: editing the URL to another location never renders that location's data.
  await page.goto("/dashboard/nashville");
  await expect(page.getByRole("heading", { name: /access denied|not found/i })).toBeVisible();
  await expect(page.getByText(/Crush Yard Nashville/)).toHaveCount(0);

  // API-level: the metrics endpoint itself refuses a location that doesn't match the
  // signed-in session, not just the page shell around it — URL tampering must fail here too.
  const res = await page.request.get("/api/metrics?location=nashville&period=day&date=2026-07-01");
  expect(res.status()).toBe(403);
  const body = await res.json();
  expect(body.error).toContain("not your location");
});

test("admin pages are not reachable from a manager session", async ({ page }) => {
  const email = uniqueEmail("non-admin-manager");
  const password = "correct horse battery staple";
  await provisionAndLoginManager(page, email, password);

  // Invariant #5: never expose the upload or admin pages to a non-admin session.
  await page.goto("/import");
  await expect(page.getByRole("heading", { name: /admin sign in required/i })).toBeVisible();

  await page.goto("/admin/managers");
  await expect(page.getByRole("heading", { name: /admin sign in required/i })).toBeVisible();
});
