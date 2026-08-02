import { test, expect } from "@playwright/test";
import { writeDay } from "../../packages/knowledge/index";
import { ingestGotabDay } from "../../packages/skills/gotab-ingest/index";
import { ingestCourtReserveDay } from "../../packages/skills/courtreserve-ingest/index";

/** Acceptance test (spec #1, section 5, "dashboard"): Orlando manager sees Orlando,
 *  other locations blocked, day/month toggle works. */

const ORLANDO = "orlando";
const SEED_DATE = "2026-07-01";
const SEED_MONTH = "2026-07";
const SEED_TOTAL = "$3,417.75"; // 1867.75 gotab + 1550.00 courtreserve, from the fixture CSVs

test.beforeAll(async () => {
  const gotab = await ingestGotabDay(ORLANDO, SEED_DATE);
  const courtreserve = await ingestCourtReserveDay(ORLANDO, SEED_DATE);
  if (!gotab || !courtreserve) throw new Error("fixture data missing for seed date — check data/imports/{gotab,courtreserve}/orlando/2026-07-01.csv");
  await writeDay(ORLANDO, SEED_DATE, [
    { locationSlug: ORLANDO, date: SEED_DATE, source: "gotab", grossAmountCents: gotab.totalGrossCents, breakdown: gotab.breakdown },
    { locationSlug: ORLANDO, date: SEED_DATE, source: "courtreserve", grossAmountCents: courtreserve.totalGrossCents, breakdown: courtreserve.breakdown },
  ]);
});

function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

test("Orlando manager sees Orlando, other locations blocked, day/month toggle works", async ({ page }) => {
  const email = uniqueEmail("orlando-manager");
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("radio", { name: /Crush Yard Orlando/i }).check();
  await page.getByRole("button", { name: /create account/i }).click();

  await expect(page).toHaveURL(/\/dashboard\/orlando(\?|$)/);
  await expect(page.getByRole("heading", { name: /Crush Yard Orlando/i })).toBeVisible();

  await page.getByRole("tab", { name: "Day" }).click();
  await page.locator('input[type="date"]').fill(SEED_DATE);
  await expect(page.getByText(SEED_TOTAL)).toBeVisible();
  await expect(page.getByText("Complete", { exact: false })).toBeVisible();

  // The full month is backfilled (data/imports fixtures cover the trailing 12 months), so
  // July shows every day but the one missing courtreserve fixture (07-02) as complete.
  const SEED_MONTH_SUMMARY = "30 complete day(s), 1 incomplete (excluded)";
  await page.getByRole("tab", { name: "Month" }).click();
  await page.locator('input[type="month"]').fill(SEED_MONTH);
  await expect(page.getByText(SEED_MONTH_SUMMARY)).toBeVisible();

  // Reloading mid-flow must preserve the Month tab and selected month, not silently
  // revert to Day/today.
  await page.reload();
  await expect(page.getByRole("tab", { name: "Month", selected: true })).toBeVisible();
  await expect(page.locator('input[type="month"]')).toHaveValue(SEED_MONTH);
  await expect(page.getByText(SEED_MONTH_SUMMARY)).toBeVisible();

  // Inactive/other location blocked, even by direct URL (invariant #1).
  await page.goto("/dashboard/nashville");
  await expect(page.getByRole("heading", { name: /access denied|not found/i })).toBeVisible();
  await expect(page.getByText(/Crush Yard Nashville/)).toHaveCount(0);

  // Logout clears the session — the dashboard is no longer reachable afterward, and the
  // message is now "sign in required", never the wrong-location copy (that would imply a
  // session that no longer exists).
  await page.goto("/dashboard/orlando");
  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard/orlando");
  await expect(page.getByRole("heading", { name: /sign in required/i })).toBeVisible();

  // Signing back in with the same credentials reaches the same account (persistence).
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/orlando(\?|$)/);
});

test("wrong password is rejected, and login has no location picker", async ({ page }) => {
  const email = uniqueEmail("wrong-password");
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("radio", { name: /Crush Yard Orlando/i }).check();
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/orlando(\?|$)/);
  await page.getByRole("button", { name: /log out/i }).click();

  await page.goto("/login");
  await expect(page.locator('input[type="radio"]')).toHaveCount(0);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("not the right password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
});

test("hostile date input on the metrics API returns a clean 400, never a crash", async ({ page }) => {
  const email = uniqueEmail("hostile-date");
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("radio", { name: /Crush Yard Orlando/i }).check();
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/orlando(\?|$)/);

  const hostile = "a".repeat(10_000);
  const res = await page.request.get(`/api/metrics?location=${ORLANDO}&period=day&date=${encodeURIComponent(hostile)}`);
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toBeTruthy();
});

test("an active location's dashboard requires signing in first", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/dashboard/orlando");
  await expect(page.getByRole("heading", { name: /sign in required/i })).toBeVisible();
  await context.close();
});
