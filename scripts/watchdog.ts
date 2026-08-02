/**
 * Missed-refresh watchdog (criteria #6). Runs on its own cron — config.yaml ->
 * refresh.watchdog_cron, 30 minutes after the 6:00 a.m. ET refresh — and alerts Slack
 * if any active location has no refresh trace for the expected date at all (the refresh
 * cron never fired). A run that fired and came back incomplete is already reported by
 * the refresh playbook itself; this only catches "nothing happened".
 */
import { readTraces } from "../packages/knowledge/index";
import { checkMissedRefresh, notifySlack, loadCfg } from "../packages/loops/index";
import { loadLocalEnv } from "../packages/core/env";
loadLocalEnv();

async function main() {
  const traces = await readTraces();
  const { expectedDate, missedLocations } = checkMissedRefresh(new Date(), traces, loadCfg());

  if (missedLocations.length === 0) {
    console.log(`✓ watchdog: every active location has a refresh trace for ${expectedDate}`);
    return;
  }
  const msg = `🚨 CY360 Sales: no refresh ran for ${expectedDate} at ${missedLocations.join(", ")} — the 6:00 a.m. ET cron may not have fired.`;
  console.error(msg);
  await notifySlack(msg);
  process.exitCode = 1;
}
main().catch(e => { console.error("watchdog failed:", e); process.exitCode = 1; });
