/**
 * D · Guardrails — the reporting product's whole value proposition is trustworthy figures
 * (see the incident in docs/ingestion-recipes.md: a stale-render bug silently inflated 13 of
 * 583 GoTab days by up to 25x). This module is what stands between "ingestion wrote a number"
 * and "the report calls that number final": every write gets checked against trailing
 * history and against scripts/gotab-verify.ts's own re-verification, and anything suspect is
 * flagged into data_quality_flags (packages/knowledge/dataQuality.ts) rather than shown as-is.
 * Outlier detection alone is not enough — a stale read of a similarly-sized neighbour day is
 * invisible to it — which is why unverified_day exists as a second, independent signal.
 */
import { readSourceGrossRange } from "../knowledge/index";
import { readVerification } from "../knowledge/gotabVerification";
import { upsertFlag, listFlags } from "../knowledge/dataQuality";

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export type OutlierResult = { isOutlier: boolean; medianCents: number };

/** A day is an outlier when it exceeds `thresholdMultiplier`x the trailing median — the
 *  incident's own rule (13 of 583 days exceeded 4x the $3,233 median). A median of 0 (no
 *  trailing history, or a genuinely dead stretch) never fires — there's nothing to compare
 *  against, so silence beats a fabricated "infinitely over median" flag. */
export function detectOutlierDay(grossCents: number, trailingValues: number[], thresholdMultiplier = 4): OutlierResult {
  const medianCents = median(trailingValues);
  const isOutlier = medianCents > 0 && grossCents > medianCents * thresholdMultiplier;
  return { isOutlier, medianCents };
}

function addDaysIso(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function fmtCentsPlain(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Any unresolved error-severity flag already on the books for this day/source (besides the
 *  one this check would itself write) — the input to the month_unreliable rollup below. */
async function monthHasUnresolvedError(locationSlug: string, month: string, excludeCode: "month_unreliable"): Promise<boolean> {
  const flags = await listFlags({ locationSlug, resolved: false });
  return flags.some(f =>
    f.severity === "error" &&
    f.code !== excludeCode &&
    ((f.scope === "day" && !!f.date && f.date.slice(0, 7) === month) || (f.scope === "month" && f.month === month)),
  );
}

/**
 * Run every guardrail for one (location, date, source) write. Called after any ingestion
 * writes a day's gross figure — the daily refresh loop, a confirmed CSV import, and
 * scripts/gotab-verify.ts's own corrections all funnel through here so no write path can
 * skip the checks.
 */
export async function runDataQualityChecks(
  locationSlug: string,
  date: string,
  source: "gotab" | "courtreserve",
  grossCents: number,
): Promise<void> {
  const trailing = await readSourceGrossRange(locationSlug, source, addDaysIso(date, -90), addDaysIso(date, -1));
  const { isOutlier, medianCents } = detectOutlierDay(grossCents, trailing.map(t => t.grossAmountCents));
  if (isOutlier) {
    await upsertFlag({
      locationSlug, scope: "day", date, source, code: "outlier_day", severity: "warn",
      message: `${source} gross ${fmtCentsPlain(grossCents)} on ${date} is more than 4x the trailing 90-day median (${fmtCentsPlain(medianCents)}).`,
    });
  }

  if (source === "gotab") {
    const verification = await readVerification(locationSlug, date);
    if (verification && (verification.status === "unreadable" || verification.status === "mismatch")) {
      await upsertFlag({
        locationSlug, scope: "day", date, source, code: "unverified_day", severity: "error",
        message: `gotab sales for ${date} could not be re-verified against the live page (status: ${verification.status}${verification.note ? ` — ${verification.note}` : ""}). Figures for this day may be wrong.`,
      });
    }
  }

  const month = date.slice(0, 7);
  if (await monthHasUnresolvedError(locationSlug, month, "month_unreliable")) {
    await upsertFlag({
      locationSlug, scope: "month", month, code: "month_unreliable", severity: "error",
      message: `${month} contains at least one unresolved data-quality error for ${locationSlug} — figures for this month may be wrong until every flagged day is resolved.`,
    });
  }
}
