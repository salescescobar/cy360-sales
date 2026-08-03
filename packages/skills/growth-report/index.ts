/**
 * Skill: growth-report (Agent B). The v5 report engine: recognized CourtReserve rows +
 * closed-day GoTab breakdowns in, the three-column-per-business-line growth report out
 * (spec #1 v5 sections 1, 2, 6). Pure functions — no I/O, no Supabase, no fetch — so the
 * whole engine is unit-testable from fixtures (see scripts/selftest.ts).
 *
 * "Recognized revenue" (spec section 2) means every number here is already service-date
 * revenue; nothing upstream of this module may hand it a future/unrecognized booking as if
 * it were final (invariant #2).
 */
import { BUSINESS_LINE_ORDER, BUSINESS_LINE_LABELS, UNMAPPED, resolveBusinessLine, type BusinessLine, type BusinessLineRule } from "../business-lines/index";
import type { RecognizedRevenueRow } from "../courtreserve-ingest/index";

export type GotabDayInput = {
  date: string; // YYYY-MM-DD
  status: "complete" | "incomplete" | "open";
  breakdown: Record<string, number>; // category -> gross cents (may be negative for discounts)
};

export type PeriodInput = {
  label: string; // e.g. "2026-08" — the calendar month this period's days come from
  courtRows: RecognizedRevenueRow[]; // ALL rows for the month; sliced to elapsedDays internally
  gotabDays: GotabDayInput[]; // ALL days for the month; sliced to elapsedDays internally
  courtreserveOk: boolean; // false when the live API call for this period failed outright
};

export type CurrentPeriodPhase = "complete" | "in_progress" | "future";

export type GrowthReportInput = {
  locationSlug: string;
  elapsedDays: number; // days 1..N included in EVERY period (criterion #2's "same elapsed days")
  current: PeriodInput;
  priorMonth: PeriodInput;
  lastYear: PeriodInput;
  rules: BusinessLineRule[];
  thresholds: { green_pct: number; red_pct: number };
  recognitionThroughDate: string; // shown on screen as "Recognized revenue through <date>" (spec section 2)
  // Day view (period=day) isolates ONE calendar day rather than accumulating day 1..N of the
  // month — elapsedDays is then the exact day-of-month to match, not a cumulative cutoff.
  singleDay?: boolean;
  // Caller (the API route) knows "today"; this module doesn't. "future" means the requested
  // period hasn't started at all (0 elapsed days) — comparing it against real history would
  // fabricate a -100% out of pure elapsed-time, not an actual decline (criterion #6), so pct
  // comparisons and alerts are suppressed entirely and `missing` says why. "in_progress" still
  // compares normally (that's the whole point of "same elapsed days"); it only adds a label.
  currentPhase?: CurrentPeriodPhase;
};

const dayOfMonth = (date: string): number => Number(date.slice(8, 10));
const daysInMonth = (yyyyMm: string): number => {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

export function priorMonthOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function sameMonthLastYearOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${y - 1}-${String(m).padStart(2, "0")}`;
}

export function lastDayOfMonth(month: string): string {
  return `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
}

export type LineAmount = { businessLine: BusinessLine | typeof UNMAPPED | "gross_revenues" | "discounts" | "total"; label: string; amountCents: number };

export type PeriodTotals = {
  elapsedDays: number; // clamped to this period's actual days-in-month when shorter (e.g. Feb)
  lines: LineAmount[]; // BUSINESS_LINE_ORDER + unmapped + gross_revenues + discounts + total, in that order
  missing: string[]; // human-readable gaps: missing/open GoTab days, or "CourtReserve: API call failed"
};

/** Sums one period's recognized rows + GoTab breakdowns into per-business-line cents,
 *  honoring the elapsed-days slice and excluding incomplete/open GoTab days from the total
 *  entirely (criterion #6) while still naming what's missing. */
function summarizePeriod(period: PeriodInput, elapsedDays: number, rules: BusinessLineRule[], singleDay = false): PeriodTotals {
  const effectiveDays = Math.min(elapsedDays, daysInMonth(period.label));
  // Month view accumulates day 1..effectiveDays (month-to-date); day view isolates exactly
  // that one day-of-month across every period being compared, never the days before it.
  const excluded = (date: string) => singleDay ? dayOfMonth(date) !== effectiveDays : dayOfMonth(date) > effectiveDays;
  const byLine = new Map<string, number>();
  let discountCents = 0;
  // A negative-amount line item (a discount/refund) is pulled into its own bucket at the
  // ROW level, before it ever reaches a business line — netting it into pickleball/food/etc.
  // first would hide it inside that line's total instead of surfacing it as its own row
  // (spec section 8: "Discounts" sits between Gross Revenues and Total).
  const bump = (key: string, cents: number) => {
    if (cents < 0) { discountCents += cents; return; }
    byLine.set(key, (byLine.get(key) ?? 0) + cents);
  };

  for (const row of period.courtRows) {
    if (excluded(row.businessDate)) continue;
    const line = resolveBusinessLine(rules, row.source, row.groupName, row.itemName);
    bump(line, row.amountCents);
  }

  const missing: string[] = [];
  if (!period.courtreserveOk) missing.push("CourtReserve: API call failed for this period — excluded from totals");

  // recognized_revenue can already carry a day's GoTab revenue directly (either grain — see
  // business-lines/index.ts) via courtRows above. The older daily_sales breakdown (gotabDays)
  // must never ALSO be summed for a date that's already covered that way, or the day's
  // revenue would be counted twice across the two grains.
  const gotabRecognizedDates = new Set(period.courtRows.filter(r => r.source === "gotab").map(r => r.businessDate));

  const missingGotabDates: string[] = [];
  for (const day of period.gotabDays) {
    if (excluded(day.date)) continue;
    if (gotabRecognizedDates.has(day.date)) continue;
    if (day.status !== "complete") { missingGotabDates.push(day.date); continue; }
    for (const [category, cents] of Object.entries(day.breakdown)) {
      const line = resolveBusinessLine(rules, "gotab", category, category);
      bump(line, cents);
    }
  }
  if (missingGotabDates.length > 0) {
    missing.push(`GoTab: ${missingGotabDates.length} day(s) missing or still open (${missingGotabDates.join(", ")}) — excluded from totals`);
  }

  const grossLines: LineAmount[] = BUSINESS_LINE_ORDER.map(bl => ({ businessLine: bl, label: BUSINESS_LINE_LABELS[bl], amountCents: byLine.get(bl) ?? 0 }));
  const unmappedCents = byLine.get(UNMAPPED) ?? 0;
  grossLines.push({ businessLine: UNMAPPED, label: "Unmapped", amountCents: unmappedCents });

  const grossRevenuesCents = grossLines.reduce((a, l) => a + l.amountCents, 0);
  const totalCents = grossRevenuesCents + discountCents;

  return {
    elapsedDays: effectiveDays,
    lines: [
      ...grossLines,
      { businessLine: "gross_revenues", label: "Gross Revenues", amountCents: grossRevenuesCents },
      { businessLine: "discounts", label: "Discounts", amountCents: discountCents },
      { businessLine: "total", label: "Total", amountCents: totalCents },
    ],
    missing,
  };
}

export type HourlyBucket = { hour: number; amountCents: number };

/**
 * Criterion #7: the day view's hourly curve, "where available." CourtReserve's
 * revenuerecognition/list rows keep StartDateTime in `raw` (nothing PII there, so it's
 * never stripped) — that's real granularity, not fabricated. GoTab's daily-summary
 * ingestion has no time-of-day field at all, so it simply isn't represented here; the
 * caller must say so rather than implying a flat/zero curve.
 */
export function buildHourlyCurve(courtRows: RecognizedRevenueRow[], date: string): HourlyBucket[] {
  const byHour = new Map<number, number>();
  for (const row of courtRows) {
    if (row.businessDate !== date) continue;
    const start = row.raw.StartDateTime;
    if (typeof start !== "string" || start.length < 13) continue;
    const hour = Number(start.slice(11, 13));
    if (!Number.isFinite(hour)) continue;
    byHour.set(hour, (byHour.get(hour) ?? 0) + row.amountCents);
  }
  return [...byHour.entries()].sort(([a], [b]) => a - b).map(([hour, amountCents]) => ({ hour, amountCents }));
}

export type Comparison = { comparisonKey: "prior_month" | "same_month_last_year"; label: string; pct: number | null };

export type ReportLineRow = {
  businessLine: LineAmount["businessLine"];
  label: string;
  current: number;
  priorMonth: number;
  lastYear: number;
  vsPriorMonthPct: number | null; // labeled by comparisons[] below — never shown bare (invariant #6)
  vsLastYearPct: number | null;
};

export type Alert = { businessLine: BusinessLine; label: string; comparison: "prior_month" | "same_month_last_year"; direction: "up" | "down"; pct: number };

export type GrowthReport = {
  locationSlug: string;
  recognitionThroughDate: string;
  rows: ReportLineRow[];
  daysRow: { current: number; priorMonth: number; lastYear: number };
  comparisonLabels: { priorMonth: string; lastYear: string };
  missing: { current: string[]; priorMonth: string[]; lastYear: string[] };
  alerts: Alert[];
};

function pctChange(current: number, compare: number): number | null {
  if (compare === 0) return null; // never divide by zero into a fabricated percentage
  return +(((current - compare) / Math.abs(compare)) * 100).toFixed(1);
}

export type DrilldownTransaction = { date: string; amountCents: number; source: "gotab" | "courtreserve"; transactionType?: string | null; paymentType?: string | null };
export type DrilldownItem = { item: string; amountCents: number; transactions: DrilldownTransaction[] };
export type DrilldownGroup = { group: string; amountCents: number; items: DrilldownItem[] };

/**
 * Business line -> group -> item -> transactions (criterion #3: "any figure is traceable
 * in at most three clicks"). GoTab has no itemized transaction below its daily category
 * total, so a GoTab "transaction" here IS that day's category total — the finest grain the
 * source actually gives us, never a fabricated split.
 */
export function buildDrilldown(period: PeriodInput, elapsedDays: number, rules: BusinessLineRule[], singleDay = false): Record<string, DrilldownGroup[]> {
  const effectiveDays = Math.min(elapsedDays, daysInMonth(period.label));
  const excluded = (date: string) => singleDay ? dayOfMonth(date) !== effectiveDays : dayOfMonth(date) > effectiveDays;
  const byLineGroupItem = new Map<string, Map<string, Map<string, DrilldownTransaction[]>>>();

  const record = (line: string, group: string, item: string, tx: DrilldownTransaction) => {
    if (!byLineGroupItem.has(line)) byLineGroupItem.set(line, new Map());
    const byGroup = byLineGroupItem.get(line)!;
    if (!byGroup.has(group)) byGroup.set(group, new Map());
    const byItem = byGroup.get(group)!;
    if (!byItem.has(item)) byItem.set(item, []);
    byItem.get(item)!.push(tx);
  };

  for (const row of period.courtRows) {
    if (excluded(row.businessDate)) continue;
    const line = resolveBusinessLine(rules, row.source, row.groupName, row.itemName);
    record(line, row.groupName, row.itemName, { date: row.businessDate, amountCents: row.amountCents, source: row.source, transactionType: row.transactionType, paymentType: row.paymentType });
  }
  // Same double-count guard as summarizePeriod above — a date already covered by a
  // recognized-revenue GoTab row must not also pull in the legacy daily_sales breakdown.
  const gotabRecognizedDates = new Set(period.courtRows.filter(r => r.source === "gotab").map(r => r.businessDate));
  for (const day of period.gotabDays) {
    if (excluded(day.date) || day.status !== "complete" || gotabRecognizedDates.has(day.date)) continue;
    for (const [category, cents] of Object.entries(day.breakdown)) {
      const line = resolveBusinessLine(rules, "gotab", category, category);
      record(line, category, category, { date: day.date, amountCents: cents, source: "gotab" });
    }
  }

  const result: Record<string, DrilldownGroup[]> = {};
  for (const [line, byGroup] of byLineGroupItem) {
    result[line] = [...byGroup.entries()].map(([group, byItem]) => {
      const items: DrilldownItem[] = [...byItem.entries()].map(([item, transactions]) => ({
        item, amountCents: transactions.reduce((a, t) => a + t.amountCents, 0), transactions,
      }));
      return { group, amountCents: items.reduce((a, i) => a + i.amountCents, 0), items };
    });
  }
  return result;
}

export function computeGrowthReport(input: GrowthReportInput): GrowthReport {
  const singleDay = input.singleDay ?? false;
  const current = summarizePeriod(input.current, input.elapsedDays, input.rules, singleDay);
  const priorMonth = summarizePeriod(input.priorMonth, input.elapsedDays, input.rules, singleDay);
  const lastYear = summarizePeriod(input.lastYear, input.elapsedDays, input.rules, singleDay);
  const phase = input.currentPhase ?? "complete";

  const rows: ReportLineRow[] = current.lines.map((l, i) => {
    const priorAmount = priorMonth.lines[i].amountCents;
    const lastYearAmount = lastYear.lines[i].amountCents;
    return {
      businessLine: l.businessLine,
      label: l.label,
      current: l.amountCents,
      priorMonth: priorAmount,
      lastYear: lastYearAmount,
      // A period that hasn't started yet (0 elapsed days) has nothing real to compare —
      // pctChange(0, X) would otherwise report a fabricated -100% purely from elapsed time,
      // not an actual decline (criterion #6's "state exactly what is missing" extends to
      // "the period itself hasn't happened," not just a missing source). Same fabrication
      // happens any time THIS period's line is exactly zero (h_zero_vs_dash): the amount cell
      // already renders as an em dash (fmtUsd never shows $0.00), so a "-100%" badge next to
      // a dash is a contradiction, not a real decline — suppress the % rather than imply one.
      vsPriorMonthPct: phase === "future" || l.amountCents === 0 ? null : pctChange(l.amountCents, priorAmount),
      vsLastYearPct: phase === "future" || l.amountCents === 0 ? null : pctChange(l.amountCents, lastYearAmount),
    };
  });

  const alerts: Alert[] = [];
  if (phase !== "future") {
    for (const row of rows) {
      if (!BUSINESS_LINE_ORDER.includes(row.businessLine as BusinessLine)) continue; // only the 8 lines alert, never Gross/Discounts/Total/Unmapped
      const bl = row.businessLine as BusinessLine;
      for (const [comparison, pct] of [["prior_month", row.vsPriorMonthPct], ["same_month_last_year", row.vsLastYearPct]] as const) {
        if (pct == null) continue;
        if (pct <= input.thresholds.red_pct) alerts.push({ businessLine: bl, label: row.label, comparison, direction: "down", pct });
        else if (pct >= input.thresholds.green_pct) alerts.push({ businessLine: bl, label: row.label, comparison, direction: "up", pct });
      }
    }
  }

  const currentMissing = [...current.missing];
  const periodNoun = singleDay ? "day" : "month";
  if (phase === "future") {
    currentMissing.push(`This ${periodNoun} hasn't started yet — 0 of ${daysInMonth(input.current.label)} day${daysInMonth(input.current.label) === 1 ? "" : "s"} elapsed. No comparison is shown until it does.`);
  } else if (phase === "in_progress" && !singleDay) {
    const total = daysInMonth(input.current.label);
    const remaining = total - current.elapsedDays;
    currentMissing.push(`In progress — ${current.elapsedDays} of ${total} days elapsed this month (${remaining} day${remaining === 1 ? "" : "s"} remaining); every column compares the same first ${current.elapsedDays} day${current.elapsedDays === 1 ? "" : "s"}.`);
  } else if (phase === "in_progress" && singleDay) {
    currentMissing.push("Today is still in progress — recognized revenue may still change before the day closes out.");
  }
  // A period with nothing else to explain itself (not future, not in-progress, no missing
  // source, no open GoTab day) but that still summed to zero across every business line
  // (h_empty_state, e.g. a month far outside the 19 months of loaded data) would otherwise
  // render as a silent all-em-dash table — indistinguishable from a real loading/rendering
  // bug. Say so explicitly instead of letting the absence of a number stand for an explanation.
  if (currentMissing.length === 0 && (rows.find(r => r.businessLine === "total")?.current ?? 0) === 0) {
    currentMissing.push(
      singleDay
        ? "No recognized revenue found for this day — nothing from CourtReserve or GoTab matched this date."
        : "No recognized revenue found for this period — nothing from CourtReserve or GoTab matched these dates.",
    );
  }

  const dayLabel = (n: number) => singleDay ? `the same day of the month` : `first ${n} day${n === 1 ? "" : "s"}`;
  return {
    locationSlug: input.locationSlug,
    recognitionThroughDate: input.recognitionThroughDate,
    rows,
    daysRow: { current: current.elapsedDays, priorMonth: priorMonth.elapsedDays, lastYear: lastYear.elapsedDays },
    comparisonLabels: {
      priorMonth: `prior month, ${dayLabel(priorMonth.elapsedDays)} (${input.priorMonth.label})`,
      lastYear: `same month last year, ${dayLabel(lastYear.elapsedDays)} (${input.lastYear.label})`,
    },
    missing: { current: currentMissing, priorMonth: priorMonth.missing, lastYear: lastYear.missing },
    alerts,
  };
}
