/**
 * Data-integrity guard for scripts/gotab-verify.ts — pure text-in/decision-out, no Playwright
 * dependency, so it's unit-testable against saved page innerText fixtures without a browser.
 *
 * Root cause of the incident this exists to prevent: GoTab's sales page renders figures with
 * client-side JavaScript. The original backfill navigated day by day and waited only for the
 * text "Gross Sales" to be present, which was already on screen from the PREVIOUS day's
 * render on a slow load — so it parsed stale numbers under the new day's date. The fix is not
 * "wait for a label" but "assert the page's own displayed period equals what we asked for,
 * from a render that has actually settled" — see docs/ingestion-recipes.md.
 */
import { extractGotabDayFromText, type GotabDay } from "./index";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-08-01" -> "Aug 1, 2026" — the exact format GoTab's period label renders (verified
 *  live against packages/skills/gotab-ingest/fixtures/orlando-2026-08-01.innertext.txt). */
export function gotabDateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function labelToIsoDate(label: string): string | null {
  const m = label.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return null;
  const monthIdx = MONTHS.indexOf(m[1]);
  if (monthIdx < 0) return null;
  return `${m[3]}-${String(monthIdx + 1).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
}

/** Raw "Aug 1, 2026 - Aug 1, 2026" substring, for the audit trail (gotab_day_verifications
 *  .page_date_shown) — kept even when it fails to parse into ISO dates, so a human reviewing
 *  an 'unreadable' row can see exactly what the page showed. */
export function extractPeriodLabelText(text: string): string | null {
  const m = text.match(/([A-Za-z]{3}\s+\d{1,2},\s*\d{4}\s*-\s*[A-Za-z]{3}\s+\d{1,2},\s*\d{4})/);
  return m ? m[1] : null;
}

/** Pulls the "Aug 1, 2026 - Aug 1, 2026" period label out of the sales page's innerText and
 *  returns both ends as ISO dates. Null when the page doesn't show a period label at all
 *  (never rendered, or a wholly different page) — that's a guard failure, not a parse. */
export function parseGotabPeriodLabel(text: string): { start: string; end: string } | null {
  const m = text.match(/([A-Za-z]{3}\s+\d{1,2},\s*\d{4})\s*-\s*([A-Za-z]{3}\s+\d{1,2},\s*\d{4})/);
  if (!m) return null;
  const start = labelToIsoDate(m[1]);
  const end = labelToIsoDate(m[2]);
  if (!start || !end) return null;
  return { start, end };
}

/**
 * THE guard. True only when the page's own period label is a single-day range and that day
 * is exactly the date we requested. A stale render showing yesterday's label (or a range that
 * doesn't collapse to one day) must return false, never a fuzzy/partial match.
 */
export function pageShowsRequestedDate(text: string, date: string): boolean {
  const period = parseGotabPeriodLabel(text);
  if (!period) return false;
  return period.start === date && period.end === date;
}

export type VerificationStatus = "ok" | "corrected" | "mismatch" | "unreadable" | "no_sales";

export type VerificationClassification = {
  status: "ok" | "corrected" | "no_sales";
  deltaCents: number;
};

/**
 * Once a stable, correctly-dated render has been parsed, decide what the verification row
 * says. `storedCents` is null when daily_sales has no gotab row at all for this day yet.
 * - no existing row + genuinely zero observed -> 'no_sales' (nothing to correct)
 * - observed differs from stored (including a real day going from nonzero to 0) -> 'corrected'
 * - observed matches stored -> 'ok'
 */
export function classifyVerification(params: { storedCents: number | null; observedCents: number }): VerificationClassification {
  const { storedCents, observedCents } = params;
  if (storedCents === null && observedCents === 0) return { status: "no_sales", deltaCents: 0 };
  if (storedCents === observedCents) return { status: "ok", deltaCents: 0 };
  return { status: "corrected", deltaCents: observedCents - (storedCents ?? 0) };
}

/** Parses the verified GoTab day once the date guard + stability check have both passed —
 *  a thin re-export so callers only need this module, not gotab-ingest/index directly. */
export function parseVerifiedGotabDay(locationSlug: string, date: string, text: string): GotabDay {
  return extractGotabDayFromText(locationSlug, date, text);
}
