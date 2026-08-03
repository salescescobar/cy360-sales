/**
 * `npm run backfill:courtreserve -- --from=2025-01-01 --to=<today>` (spec #1 v2, section 10).
 * Pages the CourtReserve live API month by month, mapping each DetailedRow into
 * sales_transactions/court_reservations/payment_type_totals via replaceCourtReserveDetail
 * (packages/knowledge/courtreserve.ts) — idempotent by construction (delete-then-insert per
 * location/range), so re-running the same --from/--to replaces rows rather than duplicating
 * them. Every month processed leaves one `imports` audit row (invariant #4 extended to the
 * API path: no ingestion without a trace), even when that month had zero transactions.
 */
import { loadLocalEnv } from "../packages/core/env";
loadLocalEnv();
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { repoPath } from "../packages/core/paths";
import { ingestCourtReserveDetail } from "../packages/skills/courtreserve-ingest/index";
import { replaceCourtReserveDetail } from "../packages/knowledge/courtreserve";
import { recordImportUpload } from "../packages/knowledge/index";

type Cfg = { sources: { courtreserve: { locations?: string[] } } };

function loadCourtReserveLocations(): string[] {
  const cfg = parse(readFileSync(repoPath("config.yaml"), "utf8")) as Cfg;
  return cfg.sources.courtreserve.locations ?? [];
}

function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const [toY, toM] = to.slice(0, 7).split("-").map(Number);
  while (y < toY || (y === toY && m <= toM)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

async function main() {
  const fromArg = process.argv.find(a => a.startsWith("--from="))?.split("=")[1];
  const toArg = process.argv.find(a => a.startsWith("--to="))?.split("=")[1];
  if (!fromArg) {
    console.error("backfill-courtreserve: --from=YYYY-MM-DD is required");
    process.exit(1);
  }
  const from = fromArg;
  const to = toArg ?? new Date().toISOString().slice(0, 10);
  const locations = loadCourtReserveLocations();

  console.log(`\n▶ CourtReserve API backfill — ${from} .. ${to}\n`);
  if (locations.length === 0) {
    console.log("  No locations configured under sources.courtreserve.locations — nothing to do.\n");
    return;
  }

  for (const locationSlug of locations) {
    for (const month of monthsBetween(from, to)) {
      const monthStart = month === from.slice(0, 7) ? from : `${month}-01`;
      const monthEnd = month === to.slice(0, 7) ? to : lastDayOfMonth(month);

      const { transactions, reservations, paymentTypeTotals } = await ingestCourtReserveDetail(locationSlug, monthStart, monthEnd);
      // Idempotent: replaces whatever was previously loaded for this location/range rather
      // than appending, so re-running the same --from/--to never duplicates rows.
      await replaceCourtReserveDetail(locationSlug, monthStart, monthEnd, { transactions, reservations, paymentTypeTotals });

      // One imports audit row per month processed, even when a month has zero transactions
      // (invariant #4's "no ingestion without a trace", extended to the API path — there's
      // no raw file here, so storagePath records the API range that was fetched instead).
      await recordImportUpload({
        locationSlug, source: "courtreserve", date: monthEnd,
        storagePath: `api://courtreserve/${locationSlug}/${monthStart}..${monthEnd}`,
        originalFilename: `courtreserve-api-backfill-${month}.json`,
      });

      console.log(`  ${locationSlug} ${month}: ${transactions.length} transaction(s), ${reservations.length} reservation(s)`);
    }
  }
  console.log("\n  Done.\n");
}
main().catch(e => { console.error("backfill-courtreserve failed:", e); process.exit(1); });
