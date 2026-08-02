/**
 * Playwright driver for gotab-ingest's browser mode. Deliberately its own module, imported
 * ONLY by scripts/gotab-refresh.ts — never by packages/loops/index.ts or anything reachable
 * from apps/web — so Playwright and its Chromium binary never end up in the Vercel
 * serverless bundle. Vercel has no writable disk for a Chromium profile and doesn't ship
 * the binary; browser-mode ingestion runs in .github/workflows/daily-refresh.yml instead.
 */
import { GotabDay, extractGotabDayFromText } from "./index";

function gotabSalesUrl(locationSlug: string, date: string): string {
  return `https://manager.gotab.io/${locationSlug}/manager/sales?fiscal_day_start=${date}&fiscal_day_end=${date}&status=PLACED`;
}

/**
 * Logs into manager.gotab.io with Playwright and returns the sales page's `main.innerText`
 * for one location/date. Credentials come from GOTAB_USER/GOTAB_PASS only (invariant #2) —
 * never logged, never written to disk. Read-only: this only navigates and reads, it never
 * submits, edits or deletes anything in GoTab (invariant #3).
 */
export async function fetchGotabSalesText(locationSlug: string, date: string): Promise<string> {
  const user = process.env.GOTAB_USER;
  const pass = process.env.GOTAB_PASS;
  if (!user || !pass) {
    throw new Error("gotab-ingest: mode=browser requires GOTAB_USER and GOTAB_PASS env vars");
  }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`https://manager.gotab.io/${locationSlug}/manager`, { waitUntil: "domcontentloaded" });

    const emailInput = page.locator('input[type="email"], input[name="username"], input[name="email"]').first();
    if (await emailInput.count() > 0) {
      await emailInput.fill(user);
      await page.locator('input[type="password"]').first().fill(pass);
      await page.locator('button[type="submit"], input[type="submit"]').first().click();
      await page.waitForLoadState("networkidle");
    }

    await page.goto(gotabSalesUrl(locationSlug, date), { waitUntil: "networkidle" });
    return await page.locator("main").innerText();
  } finally {
    await browser.close();
  }
}

/** Convenience wrapper: fetch + normalize one day in one call. */
export async function fetchGotabDay(locationSlug: string, date: string): Promise<GotabDay> {
  const text = await fetchGotabSalesText(locationSlug, date);
  return extractGotabDayFromText(locationSlug, date, text);
}
