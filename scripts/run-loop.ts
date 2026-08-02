/**
 * E · Loop runner — the daily-sales-refresh playbook, run by hand or via `npm run loop:dry`.
 * Must succeed on a fresh clone: with no fixture for the target date, both sources come
 * back "missing" and the day is (correctly) flagged incomplete — never faked as complete.
 */
import { loadLocalEnv } from "../packages/core/env";
loadLocalEnv();
import { runDailySalesRefresh, etYesterday } from "../packages/loops/index";

const dryRun = process.argv.includes("--dry-run");
const dateArg = process.argv.find(a => a.startsWith("--date="))?.split("=")[1];
const date = dateArg ?? etYesterday();

async function main() {
  console.log(`\n▶ daily-sales-refresh ${dryRun ? "DRY RUN" : "run"} — target date ${date}\n`);
  const results = await runDailySalesRefresh(date);
  for (const r of results) {
    const mark = r.status === "complete" ? "✓" : "✗";
    console.log(`  ${mark} ${r.locationSlug}: gotab=${r.gotabStatus} courtreserve=${r.courtreserveStatus} → ${r.status}${r.error ? ` (${r.error})` : ""}`);
  }
  const incomplete = results.filter(r => r.status !== "complete");
  console.log(`\n  Summary: ${results.length - incomplete.length}/${results.length} location(s) complete for ${date}.`);
  if (incomplete.length) console.log("  Incomplete day(s) flagged and Slack notified (when SLACK_WEBHOOK_URL is set) — excluded from comparatives.");
  console.log("  Trace written to .local-storage/warehouse/refresh_runs.jsonl (or Supabase when SUPABASE_URL/SUPABASE_SERVICE_KEY are set).\n");
}
main().catch(e => { console.error("Refresh failed:", e); process.exit(1); });
