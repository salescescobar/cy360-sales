import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parse } from "yaml";
import { readFileSync } from "node:fs";
import { buildPeriodInput, etDateString } from "../../../../../packages/loops/index";
import { computeGrowthReport, buildDrilldown, buildHourlyCurve, priorMonthOf, sameMonthLastYearOf } from "../../../../../packages/skills/growth-report/index";
import { listBusinessLineRules } from "../../../../../packages/knowledge/revenue";
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

  // Day view (criterion #7) is the same three-column structure sliced to a single day: the
  // "elapsed days" for a day view is always 1, and every period is that day-of-month only.
  const month = period === "day" ? value.slice(0, 7) : value;
  const elapsedDays = period === "day" ? Number(value.slice(8, 10)) : (month === today.slice(0, 7) ? Number(today.slice(8, 10)) : undefined);
  const recognitionThroughDate = period === "day" ? value : (elapsedDays != null ? `${month}-${String(elapsedDays).padStart(2, "0")}` : `${month}-31`);

  try {
    const [current, priorMonth, lastYear, rules] = await Promise.all([
      buildPeriodInput(location, month),
      buildPeriodInput(location, priorMonthOf(month)),
      buildPeriodInput(location, sameMonthLastYearOf(month)),
      listBusinessLineRules(),
    ]);

    // A full past month gets a normal full-month comparison (criterion #5's "same elapsed
    // days" only matters while the current month is still in progress) — use whichever
    // month is shorter as the elapsed-days ceiling so Feb never overruns.
    const daysInTargetMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    const effectiveElapsedDays = elapsedDays ?? daysInTargetMonth;

    const report = computeGrowthReport({
      locationSlug: location, elapsedDays: effectiveElapsedDays, current, priorMonth, lastYear, rules,
      thresholds: loadThresholds(), recognitionThroughDate,
    });
    const drilldown = buildDrilldown(current, effectiveElapsedDays, rules);
    // Hourly curve (criterion #7) only makes sense for a single day — CourtReserve only,
    // GoTab's daily-summary ingestion has no time-of-day field (spec section 3).
    const hourly = period === "day" ? { courtreserve: buildHourlyCurve(current.courtRows, value), gotabAvailable: false } : null;

    return NextResponse.json({ report, drilldown, hourly });
  } catch (e) {
    console.error("growth-report failed", e);
    return NextResponse.json({ error: "couldn't load the growth report — try again shortly" }, { status: 500 });
  }
}
