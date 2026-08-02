/**
 * Skill: metrics (Agent B). Normalized rows in, daily + monthly aggregates out.
 * A day is "complete" only when both sources loaded (criteria #1) — incomplete days
 * are excluded from comparatives, never presented as final (criteria #3).
 */

export type SourceDay = {
  date: string; // YYYY-MM-DD
  gotab: { totalGrossCents: number; breakdown: Record<string, number> } | null;
  courtreserve: { totalGrossCents: number; breakdown: Record<string, number> } | null;
};

export type DailyMetrics = {
  date: string;
  status: "complete" | "incomplete";
  gotabGrossCents: number;
  courtreserveGrossCents: number;
  totalGrossCents: number;
  breakdown: Record<string, number>; // "gotab:food" / "courtreserve:tennis" -> cents
};

export function aggregateDaily(day: SourceDay): DailyMetrics {
  const status: DailyMetrics["status"] = day.gotab != null && day.courtreserve != null ? "complete" : "incomplete";
  const gotabGrossCents = day.gotab?.totalGrossCents ?? 0;
  const courtreserveGrossCents = day.courtreserve?.totalGrossCents ?? 0;

  const breakdown: Record<string, number> = {};
  for (const [k, v] of Object.entries(day.gotab?.breakdown ?? {})) breakdown[`gotab:${k}`] = v;
  for (const [k, v] of Object.entries(day.courtreserve?.breakdown ?? {})) breakdown[`courtreserve:${k}`] = v;

  return {
    date: day.date,
    status,
    gotabGrossCents,
    courtreserveGrossCents,
    totalGrossCents: gotabGrossCents + courtreserveGrossCents,
    breakdown,
  };
}

export type MonthlyMetrics = {
  month: string; // YYYY-MM
  totalGrossCents: number;
  gotabGrossCents: number;
  courtreserveGrossCents: number;
  completeDays: number;
  incompleteDays: number;
  breakdown: Record<string, number>;
  priorPeriod: { totalGrossCents: number; pctChange: number | null } | null;
};

/** Excludes incomplete days from all totals and from the prior-period comparative. */
export function aggregateMonthly(month: string, days: DailyMetrics[], priorDays: DailyMetrics[] | null = null): MonthlyMetrics {
  const complete = days.filter(d => d.status === "complete");
  const totalGrossCents = complete.reduce((a, d) => a + d.totalGrossCents, 0);
  const gotabGrossCents = complete.reduce((a, d) => a + d.gotabGrossCents, 0);
  const courtreserveGrossCents = complete.reduce((a, d) => a + d.courtreserveGrossCents, 0);

  const breakdown: Record<string, number> = {};
  for (const d of complete) for (const [k, v] of Object.entries(d.breakdown)) breakdown[k] = (breakdown[k] ?? 0) + v;

  let priorPeriod: MonthlyMetrics["priorPeriod"] = null;
  if (priorDays) {
    const priorComplete = priorDays.filter(d => d.status === "complete");
    const priorTotal = priorComplete.reduce((a, d) => a + d.totalGrossCents, 0);
    priorPeriod = {
      totalGrossCents: priorTotal,
      pctChange: priorTotal > 0 ? +(((totalGrossCents - priorTotal) / priorTotal) * 100).toFixed(2) : null,
    };
  }

  return {
    month,
    totalGrossCents,
    gotabGrossCents,
    courtreserveGrossCents,
    completeDays: complete.length,
    incompleteDays: days.length - complete.length,
    breakdown,
    priorPeriod,
  };
}
