import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readDay, readMonth, type DailySalesRow } from "../../../../../packages/knowledge/index";
import { aggregateDaily, aggregateMonthly, type DailyMetrics } from "../../../../../packages/skills/metrics/index";
import { etDateString } from "../../../../../packages/loops/index";
import { activeLocationSlugs } from "../../lib/locations";
import { verifySession, SESSION_COOKIE_NAME } from "../../lib/session";

function toDailyMetrics(date: string, rows: DailySalesRow[]): DailyMetrics {
  const gotab = rows.find(r => r.source === "gotab");
  const courtreserve = rows.find(r => r.source === "courtreserve");
  return aggregateDaily({
    date,
    gotab: gotab ? { totalGrossCents: gotab.grossAmountCents, breakdown: gotab.breakdown } : null,
    courtreserve: courtreserve ? { totalGrossCents: courtreserve.grossAmountCents, breakdown: courtreserve.breakdown } : null,
  });
}

function priorMonthOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1)); // m is 1-indexed current month; -2 lands one month earlier, 0-indexed
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

/**
 * Scoped to the signed-in manager's own location (invariant #1) — this check is
 * defense in depth; the hard boundary is Supabase RLS (supabase/migrations/0001_init.sql)
 * once the warehouse runs against a live project instead of the local fallback.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const location = url.searchParams.get("location") ?? "";
  const period = url.searchParams.get("period") === "month" ? "month" : "day";
  const dateParam = url.searchParams.get("date");

  const jar = await cookies();
  const session = verifySession(jar.get(SESSION_COOKIE_NAME)?.value);
  if (!session || session.locationSlug !== location) {
    return NextResponse.json({ error: "forbidden — not your location" }, { status: 403 });
  }
  if (!activeLocationSlugs().includes(location)) {
    return NextResponse.json({ error: "unknown or inactive location" }, { status: 404 });
  }

  // date/month reach the filesystem (local fallback) and a Supabase filter string (live
  // warehouse) — reject anything that isn't the exact shape before either sees it, so a
  // malformed or oversized value can never become a path-traversal or query-injection input.
  // "Today" is the ET business date (packages/loops uses the same convention for refresh
  // targeting) — UTC's calendar date rolls over hours before ET's, which previously made
  // elapsedDays (and the "first N days" label) run a day ahead of the data actually loaded.
  const today = etDateString(new Date());
  const re = period === "day" ? DATE_RE : MONTH_RE;
  const value = dateParam ?? (period === "day" ? today : today.slice(0, 7));
  if (!re.test(value)) {
    return NextResponse.json({ error: `invalid ${period === "day" ? "date" : "month"} — expected ${period === "day" ? "YYYY-MM-DD" : "YYYY-MM"}` }, { status: 400 });
  }

  try {
    if (period === "day") {
      const rows = await readDay(location, value);
      return NextResponse.json(toDailyMetrics(value, rows));
    }

    const daysMap = await readMonth(location, value);
    const days = [...daysMap.entries()].map(([d, rows]) => toDailyMetrics(d, rows));

    const priorMonth = priorMonthOf(value);
    const priorDaysMap = await readMonth(location, priorMonth);
    const priorDays = [...priorDaysMap.entries()].map(([d, rows]) => toDailyMetrics(d, rows));

    // Criterion #5: only compare like-for-like when VALUE is the current, still-in-progress
    // month — a fully past month gets a normal full-month-vs-full-month comparison.
    const elapsedDays = value === today.slice(0, 7) ? Number(today.slice(8, 10)) : undefined;

    return NextResponse.json(aggregateMonthly(value, days, { month: priorMonth, days: priorDays }, { elapsedDays }));
  } catch {
    // Never surface a raw stack trace to the dashboard — the client shows this as an alert.
    return NextResponse.json({ error: "couldn't load metrics — try again shortly" }, { status: 500 });
  }
}
