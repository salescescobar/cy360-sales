/**
 * Playwright driver for gotab-ingest's browser mode. Deliberately its own module, imported
 * ONLY by scripts/gotab-refresh.ts — never by packages/loops/index.ts or anything reachable
 * from apps/web — so Playwright and its Chromium binary never end up in the Vercel
 * serverless bundle. Vercel has no writable disk for a Chromium profile and doesn't ship
 * the binary; browser-mode ingestion runs in .github/workflows/daily-refresh.yml instead.
 */
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { GotabDay, extractGotabDayFromText } from "./index";
import { repoPath } from "../../core/paths";

/**
 * Our internal location slug ("orlando") is NOT GoTab's tenant slug ("crushyard-orlando").
 * config.yaml -> locations.<slug>.gotab_slug carries the mapping; without it every URL 404s
 * and each day comes back as an error — which is exactly what the trace table showed.
 */
function gotabTenant(locationSlug: string): string {
  try {
    const cfg = parse(readFileSync(repoPath("config.yaml"), "utf8")) as { locations?: Record<string, { gotab_slug?: string }> };
    return cfg.locations?.[locationSlug]?.gotab_slug ?? locationSlug;
  } catch { return locationSlug; }
}

function gotabSalesUrl(locationSlug: string, date: string): string {
  return `https://manager.gotab.io/${gotabTenant(locationSlug)}/manager/sales?fiscal_day_start=${date}&fiscal_day_end=${date}&status=PLACED`;
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
    await page.goto(`https://manager.gotab.io/${gotabTenant(locationSlug)}/manager`, { waitUntil: "domcontentloaded" });

    const emailInput = page.locator('input[type="email"], input[name="username"], input[name="email"]').first();
    if (await emailInput.count() > 0) {
      await emailInput.fill(user);
      await page.locator('input[type="password"]').first().fill(pass);
      await page.locator('button[type="submit"], input[type="submit"]').first().click();
      // NOT networkidle: GoTab streams telemetry (Datadog RUM, OTel), so the network never
      // goes idle and any such wait burns its full timeout. Wait for navigation instead.
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);
    }

    await page.goto(gotabSalesUrl(locationSlug, date), { waitUntil: "domcontentloaded", timeout: 60000 });
    // Wait for the report itself, not for the network: the summary is server-rendered.
    await page.waitForFunction(
      () => (document.querySelector("main")?.textContent ?? "").includes("Gross Sales"),
      undefined, { timeout: 45000 },
    ).catch(() => undefined);
    const text = await page.locator("main").innerText();
    // Fail LOUDLY and specifically when we were bounced to the login page, so the trace row
    // says "login failed" instead of an opaque timeout.
    if (!text.includes("Gross Sales")) {
      const looksLikeLogin = /sign in|log in|password/i.test(text);
      throw new Error(looksLikeLogin
        ? "gotab login failed — check GOTAB_USER/GOTAB_PASS, or the account may require 2FA"
        : `gotab sales page did not render a summary for ${date} (got ${text.length} chars)`);
    }
    return text;
  } finally {
    await browser.close();
  }
}

/** Convenience wrapper: fetch + normalize one day in one call. */
export async function fetchGotabDay(locationSlug: string, date: string): Promise<GotabDay> {
  const text = await fetchGotabSalesText(locationSlug, date);
  return extractGotabDayFromText(locationSlug, date, text);
}
