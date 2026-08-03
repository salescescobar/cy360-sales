import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parse } from "yaml";
import { readFileSync } from "node:fs";
import { buildPeriodInput, etDateString } from "../../../../../packages/loops/index";
import { computeGrowthReport, buildDrilldown, buildHourlyCurve, priorMonthOf, sameMonthLastYearOf, type CurrentPeriodPhase } from "../../../../../packages/skills/growth-report/index";
import { readDay } from "../../../../../packages/knowledge/index";
import { listBusinessLineRules } from "../../../../../packages/knowledge/revenue";
import { listFlags } from "../../../../../packages/knowledge/dataQuality";
import { repoPath } from "../../../../../packages/core/paths";
import { activeLocationSlugs } from "../../lib/locations";
import { verifySession, SESSION_COOKIE_NAME } from "../../lib/session";

type ReportCfg = { thresholds: { green_pct: number; red_pct: number } };
function loadThresholds(): ReportCfg["thresholds"] {
  const cfg = parse(readFileSync(repoPath("config.yaml"), "utf8")) as { report: ReportCfg };
  return cfg.report.thresholds;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

/**
 * The v5 growth report (spec section 1, 6): three columns per business line + the drill-down
 * tree behind them. Scoped to the signed-in manager's own location — same defense-in-depth
 * pattern as /api/metrics (invariant #1; the hard boundary is Supabase RLS).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const location = url.searchParams.get("location") ?? "";
  const period = url.searchParams.get("period") === "day" ? "day" : "month";
  const dateParam = url.searchParams.get("date");

  const jar = await cookies();
  const session = verifySession(jar.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return NextResponse.json({ error: "authentication required — sign in to view this dashboard" }, { status: 401 });
  }
  if (session.locationSlug !== location) {
    return NextResponse.json({ error: "forbidden — not your location" }, { status: 403 });
  }
  if (!activeLocationSlugs().includes(location)) {
    return NextResponse.json({ error: "unknown or inactive location" }, { status: 404 });
  }

  const today = etDateString(new Date());
  const re = period === "day" ? DATE_RE : MONTH_RE;
  const value = dateParam ?? (period === "day" ? today : today.slice(0, 7));
  if (!re.test(value)) {
    return NextResponse.json({ error: `invalid ${period === "day" ? "date" : "month"} — expected ${period === "day" ? "YYYY-MM-DD" : "YYYY-MM"}` }, { status: 400 });
  }

  // Day view (criterion #7) is the same three-column structure sliced to ONE calendar day
  // (never accumulated from day 1 of the month — that would silently turn "day view for the
  // 15th" into "month-to-date through the 15th"); elapsedDays becomes the exact day-of-month
  // every period is matched against instead of a cumulative cutoff (growth-report's singleDay
  // mode).
  const month = period === "day" ? value.slice(0, 7) : value;
  const daysInTargetMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

  // A period the calendar hasn't reached yet has 0 elapsed days — comparing it against real
  // history would fabricate a decline out of pure elapsed time (criterion #6). A period fully
  // in the past gets a normal full comparison. Only the CURRENT calendar month/day is partial.
  let currentPhase: CurrentPeriodPhase;
  let effectiveElapsedDays: number;
  if (period === "day") {
    if (value > today) { currentPhase = "future"; }
    else if (value === today) { currentPhase = "in_progress"; }
    else { currentPhase = "complete"; }
    effectiveElapsedDays = Number(value.slice(8, 10));
  } else if (month > today.slice(0, 7)) {
    currentPhase = "future";
    effectiveElapsedDays = 0;
  } else if (month === today.slice(0, 7)) {
    currentPhase = "in_progress";
    effectiveElapsedDays = Number(today.slice(8, 10));
  } else {
    currentPhase = "complete";
    effectiveElapsedDays = daysInTargetMonth;
  }
  const recognitionThroughDate = period === "day" ? value : `${month}-${String(effectiveElapsedDays || 1).padStart(2, "0")}`;

  try {
    const [current, priorMonth, lastYear, rules] = await Promise.all([
      buildPeriodInput(location, month),
      buildPeriodInput(location, priorMonthOf(month)),
      buildPeriodInput(location, sameMonthLastYearOf(month)),
      listBusinessLineRules(),
    ]);

    const singleDay = period === "day";
    const report = computeGrowthReport({
      locationSlug: location, elapsedDays: effectiveElapsedDays, current, priorMonth, lastYear, rules,
      thresholds: loadThresholds(), recognitionThroughDate, singleDay, currentPhase,
    });
    const drilldown = buildDrilldown(current, effectiveElapsedDays, rules, singleDay);
    // Hourly curve (criterion #7) only makes sense for a single day — CourtReserve only,
    // GoTab's daily-summary ingestion has no time-of-day field (spec section 3).
    const hourly = period === "day" ? { courtreserve: buildHourlyCurve(current.courtRows, value), gotabAvailable: false } : null;
    // Criterion #3/reads_supabase: a day view needs to isolate ONE source's own total (e.g.
    // "GoTab gross for this specific day") without it being merged into the combined figure —
    // daily_sales already carries gross_amount_cents per source for exactly this.
    const bySource = period === "day" ? await (async () => {
      const rows = await readDay(location, value);
      const gotab = rows.find(r => r.source === "gotab");
      const courtreserve = rows.find(r => r.source === "courtreserve");
      return { gotabGrossCents: gotab?.grossAmountCents ?? null, courtreserveGrossCents: courtreserve?.grossAmountCents ?? null };
    })() : null;

    // Honesty banner: never let an unresolved error-severity flag ride along silently under
    // a period that reads as final (packages/core/dataQuality.ts writes these; an admin
    // clears them from /admin/data-quality once actually verified). Scoped to whatever the
    // manager is actually looking at — a day view only names that day's own flags/month
    // rollup, a month view sweeps every day flag inside it.
    const openErrors = (await listFlags({ locationSlug: location, resolved: false })).filter(f => f.severity === "error");
    const inScope = openErrors.filter(f =>
      period === "day"
        ? (f.scope === "day" && f.date === value) || (f.scope === "month" && f.month === value.slice(0, 7))
        : (f.scope === "month" && f.month === value) || (f.scope === "day" && !!f.date && f.date.slice(0, 7) === value),
    );
    const dataQuality = {
      hasUnresolvedError: inScope.length > 0,
      dates: [...new Set(inScope.filter(f => f.scope === "day" && f.date).map(f => f.date as string))].sort(),
      messages: inScope.map(f => f.message),
    };

    return NextResponse.json({ report, drilldown, hourly, bySource, dataQuality });
  } catch (e) {
    console.error("growth-report failed", e);
    return NextResponse.json({ error: "couldn't load the growth report — try again shortly" }, { status: 500 });
  }
}
