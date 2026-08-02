import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readDay, readMonth, type DailySalesRow } from "../../../../../packages/knowledge/index";
import { aggregateDaily, aggregateMonthly, type DailyMetrics } from "../../../../../packages/skills/metrics/index";
import { activeLocationSlugs } from "../../lib/locations";

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
  const managerLocation = jar.get("manager_location")?.value;
  if (!managerLocation || managerLocation !== location) {
    return NextResponse.json({ error: "forbidden — not your location" }, { status: 403 });
  }
  if (!activeLocationSlugs().includes(location)) {
    return NextResponse.json({ error: "unknown or inactive location" }, { status: 404 });
  }

  const today = new Date().toISOString().slice(0, 10);

  if (period === "day") {
    const date = dateParam ?? today;
    const rows = await readDay(location, date);
    return NextResponse.json(toDailyMetrics(date, rows));
  }

  const month = dateParam ?? today.slice(0, 7);
  const daysMap = await readMonth(location, month);
  const days = [...daysMap.entries()].map(([d, rows]) => toDailyMetrics(d, rows));

  const priorMonth = priorMonthOf(month);
  const priorDaysMap = await readMonth(location, priorMonth);
  const priorDays = [...priorDaysMap.entries()].map(([d, rows]) => toDailyMetrics(d, rows));

  return NextResponse.json(aggregateMonthly(month, days, priorDays));
}
