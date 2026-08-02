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

test("Orlando manager sees Orlando, other locations blocked, day/month toggle works", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("radio", { name: /Crush Yard Orlando/i }).check();
  await page.getByRole("button", { name: /continue/i }).click();

  await expect(page).toHaveURL(/\/dashboard\/orlando$/);
  await expect(page.getByRole("heading", { name: /Crush Yard Orlando/i })).toBeVisible();

  await page.getByRole("tab", { name: "Day" }).click();
  await page.locator('input[type="date"]').fill(SEED_DATE);
  await expect(page.getByText(SEED_TOTAL)).toBeVisible();
  await expect(page.getByText("Complete", { exact: false })).toBeVisible();

  await page.getByRole("tab", { name: "Month" }).click();
  await page.locator('input[type="month"]').fill(SEED_MONTH);
  await expect(page.getByText(SEED_TOTAL)).toBeVisible();

  // Inactive/other location blocked, even by direct URL (invariant #1).
  await page.goto("/dashboard/nashville");
  await expect(page.getByRole("heading", { name: /access denied|not found/i })).toBeVisible();
  await expect(page.getByText(/Crush Yard Nashville/)).toHaveCount(0);

  // Logout clears the session — the dashboard is no longer reachable afterward.
  await page.goto("/dashboard/orlando");
  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard/orlando");
  await expect(page.getByRole("heading", { name: /access denied/i })).toBeVisible();
});

test("hostile date input on the metrics API returns a clean 400, never a crash", async ({ request }) => {
  await request.post("/api/login", { form: { location: ORLANDO } });
  const hostile = "a".repeat(10_000);
  const res = await request.get(`/api/metrics?location=${ORLANDO}&period=day&date=${encodeURIComponent(hostile)}`);
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toBeTruthy();
});

test("an active location's dashboard is blocked without a matching session", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/dashboard/orlando");
  await expect(page.getByRole("heading", { name: /access denied/i })).toBeVisible();
  await context.close();
});
