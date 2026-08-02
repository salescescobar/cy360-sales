/**
 * Initial load (criteria #5): backfill the trailing N months (config.yaml ->
 * refresh.backfill_months, default 12) for every ACTIVE location, via API when
 * config.yaml -> sources.*.mode is "api" (credentials arrived), else CSV from
 * /data/imports. Reuses refreshLocationDay — the same function the daily cron uses —
 * so every backfilled day gets the same complete/incomplete + trace treatment
 * (invariant #4: every run leaves a trace row).
 */
import { loadLocalEnv } from "../packages/core/env";
loadLocalEnv();
import { loadCfg, activeLocations, refreshLocationDay, etYesterday, type LoopsCfg } from "../packages/loops/index";

function dateRange(monthsBack: number): string[] {
  const end = new Date(`${etYesterday()}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - monthsBack);

  const dates: string[] = [];
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

async function backfill(cfg: LoopsCfg = loadCfg()): Promise<{ complete: number; incomplete: number; locations: string[]; dates: string[] }> {
  const locations = activeLocations(cfg);
  const monthsArg = process.argv.find(a => a.startsWith("--months="))?.split("=")[1];
  const backfillMonths = monthsArg ? parseInt(monthsArg, 10) : (cfg.refresh?.backfill_months ?? 12);
  const dates = dateRange(backfillMonths);

  let complete = 0, incomplete = 0;
  for (const slug of locations) {
    for (const date of dates) {
      const r = await refreshLocationDay(slug, date, cfg);
      if (r.status === "complete") complete++; else incomplete++;
    }
  }
  return { complete, incomplete, locations, dates };
}

async function main() {
  console.log("\n▶ Backfill — trailing months for every active location\n");
  const { complete, incomplete, locations, dates } = await backfill();
  console.log(`  Locations: ${locations.join(", ") || "(none active)"}`);
  console.log(`  Date range: ${dates[0]} .. ${dates[dates.length - 1]} (${dates.length} day(s))`);
  console.log(`\n  Summary: ${complete} complete day(s), ${incomplete} incomplete/missing (no source data loaded for that day yet).`);
  console.log("  Trace written to .local-storage/warehouse/refresh_runs.jsonl (or Supabase when configured).\n");
}
main().catch(e => { console.error("Backfill failed:", e); process.exit(1); });
