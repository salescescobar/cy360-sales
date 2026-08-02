/**
 * Production GoTab refresh via Playwright (mode: browser) — the real daily-sales-refresh
 * for a date range, run by .github/workflows/daily-refresh.yml instead of Vercel Cron:
 * Vercel's serverless functions have no writable disk for a Chromium profile and don't
 * ship the browser binary, so browser-mode ingestion has to run somewhere with real disk.
 * Reuses refreshLocationDay (the same function the Vercel cron path and scripts/backfill.ts
 * use) so every day still gets the same complete/incomplete + trace treatment — this only
 * forces gotab's mode to "browser" for this run; courtreserve ingestion is unaffected.
 * --from/--to select the date range (default: yesterday, America/New_York) so this one
 * script covers both the daily cron and the 12-month backfill.
 */
import { loadLocalEnv } from "../packages/core/env";
loadLocalEnv();
import { loadCfg, activeLocations, refreshLocationDay, etYesterday, type LoopsCfg } from "../packages/loops/index";
import { fetchGotabSalesText } from "../packages/skills/gotab-ingest/browser";

function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const end = new Date(`${to}T00:00:00Z`);
  for (const d = new Date(`${from}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

async function main() {
  if (!process.env.GOTAB_USER || !process.env.GOTAB_PASS) {
    throw new Error("gotab-refresh: GOTAB_USER and GOTAB_PASS env vars are required for mode=browser");
  }

  const yesterday = etYesterday();
  const from = process.argv.find(a => a.startsWith("--from="))?.split("=")[1] ?? yesterday;
  const to = process.argv.find(a => a.startsWith("--to="))?.split("=")[1] ?? yesterday;
  const dates = dateRange(from, to);

  const cfg = loadCfg();
  const browserCfg: LoopsCfg = { ...cfg, sources: { ...cfg.sources, gotab: { ...cfg.sources.gotab, mode: "browser" } } };
  const locations = activeLocations(cfg);

  console.log(`\n▶ gotab-refresh (browser mode) — ${locations.join(", ") || "(none active)"} — ${from}..${to} (${dates.length} day(s))\n`);

  let complete = 0, incomplete = 0;
  for (const slug of locations) {
    for (const date of dates) {
      const r = await refreshLocationDay(slug, date, browserCfg, { fetchText: fetchGotabSalesText });
      const mark = r.status === "complete" ? "✓" : "✗";
      console.log(`  ${mark} ${slug} ${date}: gotab=${r.gotabStatus} courtreserve=${r.courtreserveStatus} → ${r.status}${r.error ? ` (${r.error})` : ""}`);
      if (r.status === "complete") complete++; else incomplete++;
    }
  }
  console.log(`\n  Summary: ${complete} complete day(s), ${incomplete} incomplete/missing.\n`);
}
main().catch(e => { console.error("gotab-refresh failed:", (e as Error).message ?? e); process.exit(1); });
