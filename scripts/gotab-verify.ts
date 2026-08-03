/**
 * Re-verify (and repair) every day of GoTab sales already loaded into the warehouse.
 *
 * Root cause of the incident this responds to: the original backfill navigated GoTab's
 * sales page day by day and waited only for the text "Gross Sales" to be present — but
 * GoTab renders that page with client-side JavaScript, so on a slow load the label was
 * already on screen from the PREVIOUS day's render, and the script parsed stale numbers
 * under the new day's date. 13 of 583 days ended up more than 4x their trailing median.
 * Outlier detection alone can't fix this retroactively — a stale read of a similarly-sized
 * neighbour day is invisible to it — so every day gets re-checked here, not just outliers.
 * See docs/ingestion-recipes.md, "Screen-scraped data is guilty until proven innocent."
 *
 * GoTab blocks automated browsers, so this connects over the Chrome DevTools Protocol to a
 * human's ALREADY-authenticated Chrome (start it with --remote-debugging-port=9222) rather
 * than launching its own. It never opens a fresh browser context — that would be logged
 * out — it reuses the human's existing context so the session cookies come along for free.
 *
 * The guard (the entire point of this script): before parsing anything, it waits for the
 * page's OWN displayed period label to contain the exact date requested, then re-reads the
 * page twice 300ms apart and requires both reads to be byte-identical before trusting it.
 * A page that never shows the right date is recorded 'unreadable' and NOTHING is parsed from
 * it — never a guess, never a fallback to the stale numbers already on screen.
 *
 * Usage:
 *   npx tsx scripts/gotab-verify.ts --from=2024-08-01 --to=2026-08-02 [--location=orlando] [--port=9222]
 *   npx tsx scripts/gotab-verify.ts --only-suspect [--location=orlando]   # re-check flagged days only
 */
import { readFileSync, mkdirSync, appendFileSync } from "node:fs";
import { parse } from "yaml";
import { repoPath } from "../packages/core/paths";
import { readDay, writeDay } from "../packages/knowledge/index";
import { writeVerification, readSuspectDates, type GotabVerificationRow } from "../packages/knowledge/gotabVerification";
import { runDataQualityChecks } from "../packages/core/dataQuality";
import {
  gotabDateLabel, pageShowsRequestedDate, extractPeriodLabelText, parseVerifiedGotabDay, classifyVerification,
  type VerificationStatus,
} from "../packages/skills/gotab-ingest/verify";
import { activeLocations, loadCfg } from "../packages/loops/index";

const GUARD_TIMEOUT_MS = 20_000;
const STABILITY_GAP_MS = 300;
const RECYCLE_EVERY = 50;

const LOG_FILE = repoPath(".loop", "gotab-verify.log");

function log(line: string): void {
  mkdirSync(repoPath(".loop"), { recursive: true });
  const stamped = `${new Date().toISOString()} ${line}`;
  console.log(stamped);
  appendFileSync(LOG_FILE, stamped + "\n");
}

function gotabTenant(locationSlug: string): string {
  const cfg = parse(readFileSync(repoPath("config.yaml"), "utf8")) as { locations?: Record<string, { gotab_slug?: string }> };
  return cfg.locations?.[locationSlug]?.gotab_slug ?? locationSlug;
}

function gotabSalesUrl(locationSlug: string, date: string): string {
  return `https://manager.gotab.io/${gotabTenant(locationSlug)}/manager/sales?fiscal_day_start=${date}&fiscal_day_end=${date}&status=PLACED`;
}

function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const end = new Date(`${to}T00:00:00Z`);
  for (const d = new Date(`${from}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function fmtCents(cents: number | null): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Summary = { ok: number; corrected: number; mismatch: number; unreadable: number; noSales: number; swingCents: number };

/** Connects to the human's already-open, already-authenticated Chrome — never launches a
 *  fresh browser (GoTab blocks automated ones) and never opens a fresh context (that would
 *  be logged out). Tries 127.0.0.1 then [::1] since --remote-debugging-port binds differently
 *  across OS/Chrome versions. */
async function connectToHumanChrome(port: number) {
  const { chromium } = await import("playwright");
  for (const host of ["127.0.0.1", "[::1]"]) {
    try {
      const browser = await chromium.connectOverCDP(`http://${host}:${port}`);
      const context = browser.contexts()[0];
      if (!context) { await browser.close(); continue; }
      return { browser, context };
    } catch {
      // try the next host
    }
  }
  throw new Error(
    `gotab-verify: could not connect to Chrome over CDP on port ${port} (tried 127.0.0.1 and [::1]) — ` +
    "start Chrome with --remote-debugging-port and sign into GoTab in it first.",
  );
}

async function verifyOneDay(page: import("playwright").Page, locationSlug: string, date: string): Promise<{ status: VerificationStatus; note?: string }> {
  const write = async (row: Omit<GotabVerificationRow, "checkedAt">) => {
    await writeVerification(row);
    return { status: row.status, note: row.note ?? undefined };
  };

  await page.goto(gotabSalesUrl(locationSlug, date), { waitUntil: "domcontentloaded", timeout: 60_000 });

  // THE GUARD: poll the page's own rendered text for the exact date label we asked for.
  // Never trust "a figures label appeared" — that's precisely what let the original bug
  // parse a stale render (see the module doc comment above).
  const needle = gotabDateLabel(date);
  let matched = true;
  try {
    await page.waitForFunction(
      (n: string) => (document.querySelector("main")?.textContent ?? "").includes(n),
      needle,
      { timeout: GUARD_TIMEOUT_MS, polling: 300 },
    );
  } catch {
    matched = false;
  }
  if (!matched) {
    const text = await page.locator("main").innerText().catch(() => "");
    return write({
      locationSlug, date, storedCents: null, observedCents: null, pageDateShown: extractPeriodLabelText(text),
      status: "unreadable", note: `page never displayed "${needle}" within ${GUARD_TIMEOUT_MS}ms`,
    });
  }

  // Re-read after the date matches, and require two consecutive reads 300ms apart to be
  // byte-identical — catches the transitional flicker where the date label has updated but
  // the figures underneath haven't caught up yet (the exact failure mode of the incident).
  const read1 = await page.locator("main").innerText();
  await page.waitForTimeout(STABILITY_GAP_MS);
  const read2 = await page.locator("main").innerText();
  if (read1 !== read2 || !pageShowsRequestedDate(read2, date)) {
    return write({
      locationSlug, date, storedCents: null, observedCents: null, pageDateShown: extractPeriodLabelText(read2),
      status: "mismatch", note: "two reads 300ms apart differed (or the date drifted between them) — page still updating, nothing parsed",
    });
  }

  let parsed;
  try {
    parsed = parseVerifiedGotabDay(locationSlug, date, read2);
  } catch (e) {
    return write({
      locationSlug, date, storedCents: null, observedCents: null, pageDateShown: extractPeriodLabelText(read2),
      status: "unreadable", note: `page showed the right date but figures didn't parse: ${(e as Error).message}`,
    });
  }

  const existing = await readDay(locationSlug, date);
  const storedCents = existing.find(r => r.source === "gotab")?.grossAmountCents ?? null;
  const { status, deltaCents } = classifyVerification({ storedCents, observedCents: parsed.totalGrossCents });

  if (status === "corrected") {
    await writeDay(locationSlug, date, [{ locationSlug, date, source: "gotab", grossAmountCents: parsed.totalGrossCents, breakdown: parsed.breakdown }]);
  }
  try {
    await runDataQualityChecks(locationSlug, date, "gotab", parsed.totalGrossCents);
  } catch (e) {
    log(`  ⚠ data-quality check failed for ${locationSlug} ${date}: ${(e as Error).message}`);
  }

  const note = status === "corrected"
    ? `stored ${fmtCents(storedCents)} -> observed ${fmtCents(parsed.totalGrossCents)} (Δ ${fmtCents(deltaCents)})`
    : status === "no_sales" ? "no stored row and $0 observed — closed/no-sales day" : undefined;

  await write({
    locationSlug, date, storedCents, observedCents: parsed.totalGrossCents, observedBreakdown: parsed.breakdown,
    pageDateShown: extractPeriodLabelText(read2), status, note,
  });
  return { status, note };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.find(a => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  const has = (name: string) => args.includes(`--${name}`);

  const port = Number(flag("port") ?? 9222);
  const onlySuspect = has("only-suspect");
  const cfg = loadCfg();
  const locationArg = flag("location");
  const locations = locationArg ? [locationArg] : activeLocations(cfg);
  if (locations.length === 0) throw new Error("gotab-verify: no locations to check — pass --location=<slug> or activate one in config.yaml");

  const to = flag("to") ?? new Date().toISOString().slice(0, 10);
  const from = flag("from") ?? "2000-01-01";
  if (!onlySuspect && !flag("from")) {
    throw new Error("gotab-verify: pass --from=YYYY-MM-DD (and optionally --to=) for a full pass, or --only-suspect to re-check flagged days");
  }

  console.log(`\n▶ gotab-verify — ${locations.join(", ")} — ${onlySuspect ? "suspect days only" : `${from}..${to}`}\n`);

  const { browser, context } = await connectToHumanChrome(port);
  let page = await context.newPage();
  let processed = 0;
  const summary: Summary = { ok: 0, corrected: 0, mismatch: 0, unreadable: 0, noSales: 0, swingCents: 0 };

  try {
    for (const locationSlug of locations) {
      const dates = onlySuspect ? await readSuspectDates(locationSlug) : dateRange(from, to);
      log(`${locationSlug}: ${dates.length} day(s) to check`);

      for (const date of dates) {
        // Recycle the tab every RECYCLE_EVERY iterations — GoTab's client-side app can
        // accumulate memory/state across hundreds of navigations in one tab.
        if (processed > 0 && processed % RECYCLE_EVERY === 0) {
          const old = page;
          page = await context.newPage();
          await old.close();
        }

        const before = await readDay(locationSlug, date);
        const storedBefore = before.find(r => r.source === "gotab")?.grossAmountCents ?? null;
        const { status, note } = await verifyOneDay(page, locationSlug, date);
        processed++;

        if (status === "ok") summary.ok++;
        else if (status === "mismatch") summary.mismatch++;
        else if (status === "unreadable") summary.unreadable++;
        else if (status === "no_sales") summary.noSales++;
        else if (status === "corrected") {
          summary.corrected++;
          const after = await readDay(locationSlug, date);
          const observed = after.find(r => r.source === "gotab")?.grossAmountCents ?? 0;
          summary.swingCents += Math.abs(observed - (storedBefore ?? 0));
        }

        log(`  ${locationSlug} ${date}: ${status}${note ? ` — ${note}` : ""}`);
      }
    }
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }

  console.log("\n▶ gotab-verify report");
  console.log(`  verified ok:  ${summary.ok}`);
  console.log(`  corrected:    ${summary.corrected} (total dollar swing ${fmtCents(summary.swingCents)})`);
  console.log(`  mismatch:     ${summary.mismatch}`);
  console.log(`  unreadable:   ${summary.unreadable}`);
  console.log(`  no_sales:     ${summary.noSales}`);
  console.log(`  total checked: ${processed}\n`);
}

main().catch(e => { console.error("gotab-verify failed:", (e as Error).message ?? e); process.exit(1); });
