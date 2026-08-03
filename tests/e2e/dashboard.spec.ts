import { test, expect, type Page } from "@playwright/test";
import { writeDay } from "../../packages/knowledge/index";
import { ensureAdmin } from "../../packages/knowledge/admins";

/** Acceptance test (spec #1 v2, section 4 & 6): manager accounts are admin-provisioned,
 *  never self-service; Orlando manager sees Orlando, other locations blocked, day/month
 *  toggle works. */

const ORLANDO = "orlando";

/** A random year+month, well before this product (or Crush Yard's real sales data)
 *  existed, and randomized like uniqueEmail() below — the live warehouse is a real,
 *  persistent, shared database (not reset between runs), so a fixed month would collide
 *  with whatever a previous run already wrote there and break the exact day-count assertion. */
function uniqueTestMonth(): string {
  const seed = Date.now() + Math.floor(Math.random() * 1e6);
  const year = 2000 + (seed % 25); // 2000-2024 — decades before any real data
  const month = 1 + (Math.floor(seed / 25) % 12);
  return `${year}-${String(month).padStart(2, "0")}`;
}

const SEED_MONTH = uniqueTestMonth();
const SEED_DATE = `${SEED_MONTH}-01`;
const SEED_TOTAL = "$3,417.75"; // 1867.75 gotab + 1550.00 courtreserve

const ADMIN_EMAIL = "e2e-admin@example.com";
const ADMIN_PASSWORD = "correct horse battery staple admin";

test.beforeAll(async () => {
  await ensureAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);

  // Two complete days and one gotab-only (incomplete) day for the month view.
  await writeDay(ORLANDO, SEED_DATE, [
    { locationSlug: ORLANDO, date: SEED_DATE, source: "gotab", grossAmountCents: 186775, breakdown: { food: 84250, alcohol: 61000 } },
    { locationSlug: ORLANDO, date: SEED_DATE, source: "courtreserve", grossAmountCents: 155000, breakdown: { pickleball: 120000 } },
  ]);
  await writeDay(ORLANDO, `${SEED_MONTH}-05`, [
    { locationSlug: ORLANDO, date: `${SEED_MONTH}-05`, source: "gotab", grossAmountCents: 50000, breakdown: {} },
    { locationSlug: ORLANDO, date: `${SEED_MONTH}-05`, source: "courtreserve", grossAmountCents: 25000, breakdown: {} },
  ]);
  await writeDay(ORLANDO, `${SEED_MONTH}-06`, [
    { locationSlug: ORLANDO, date: `${SEED_MONTH}-06`, source: "gotab", grossAmountCents: 999999, breakdown: {} }, // courtreserve missing -> incomplete
  ]);
});

function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Admin provisions a manager account from /admin/managers (criterion #7) — this is now
 *  the only way a manager account is created; there is no public self-service signup. */
async function provisionManager(page: Page, email: string, password: string): Promise<void> {
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
}

async function managerLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

test("Orlando manager sees Orlando, other locations blocked, day/month toggle works", async ({ page }) => {
  const email = uniqueEmail("orlando-manager");
  const password = "correct horse battery staple";
  await provisionManager(page, email, password);
  await managerLogin(page, email, password);

  await expect(page).toHaveURL(/\/dashboard\/orlando(\?|$)/);
  await expect(page.getByRole("heading", { name: /Crush Yard Orlando/i })).toBeVisible();

  await page.getByRole("tab", { name: "Day" }).click();
  await page.locator('input[type="date"]').fill(SEED_DATE);
  await expect(page.getByText(SEED_TOTAL)).toBeVisible();
  await expect(page.getByText("Complete", { exact: false })).toBeVisible();

  const SEED_MONTH_SUMMARY = "2 complete day(s), 1 incomplete (excluded)";
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
  await managerLogin(page, email, password);
  await expect(page).toHaveURL(/\/dashboard\/orlando(\?|$)/);
});

test("wrong password is rejected, and login has no location picker or signup link", async ({ page }) => {
  const email = uniqueEmail("wrong-password");
  const password = "correct horse battery staple";
  await provisionManager(page, email, password);

  await page.goto("/login");
  await expect(page.locator('input[type="radio"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: /create one|sign up/i })).toHaveCount(0);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("not the right password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
});

test("hostile date input on the metrics API returns a clean 400, never a crash", async ({ page }) => {
  const email = uniqueEmail("hostile-date");
  const password = "correct horse battery staple";
  await provisionManager(page, email, password);
  await managerLogin(page, email, password);
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

test("a session that goes stale mid-visit sends the manager back to sign in, not a raw error", async ({ page, context }) => {
  const email = uniqueEmail("stale-session");
  const password = "correct horse battery staple";
  await provisionManager(page, email, password);
  await managerLogin(page, email, password);
  await expect(page).toHaveURL(/\/dashboard\/orlando(\?|$)/);

  // Corrupt the signed session cookie in place (simulates a rotated secret / tampering)
  // without navigating away — the manager is mid-visit when it goes stale.
  const cookies = await context.cookies();
  const session = cookies.find(c => c.name === "manager_session");
  if (!session) throw new Error("manager_session cookie missing after login");
  await context.addCookies([{ ...session, value: session.value.slice(0, -4) + "0000" }]);

  // dispatchEvent, not click(): the handler triggers a same-tab client-side redirect
  // (window.location), and Playwright's post-click actionability checks hang racing
  // that navigation — a Playwright/Chromium quirk, not app behavior under test here.
  await page.getByRole("tab", { name: "Month" }).dispatchEvent("click");
  await page.waitForURL(/\/login$/);
  await expect(page.getByText(/couldn't load metrics/i)).toHaveCount(0);
});
