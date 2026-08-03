/**
 * Shared number formatting for the growth report (spec #1 v5 section 8): tabular numerals,
 * thousands separators, negatives in parentheses, an em dash for absent values — never
 * "$0.00" standing in for "we have no data here."
 */

/** `null`/`undefined`/exactly `0` -> em dash. Spec section 8 is literal: "em dash for absent
 *  values (never $0.00)" — a business line with nothing booked this period reads the same as
 *  one with no data at all, and either way "$0.00" invites a manager to wonder whether the
 *  number is broken rather than genuinely zero. */
export function fmtUsd(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return "—";
  const dollars = Math.abs(cents) / 100;
  const formatted = dollars.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return cents < 0 ? `(${formatted})` : formatted;
}

/** Always states what it compares — invariant #6: never a bare percentage. */
export function fmtPct(pct: number | null | undefined): string {
  if (pct == null) return "—";
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

export function trafficDirection(pct: number | null | undefined, thresholds: { green_pct: number; red_pct: number }): "up" | "down" | "flat" {
  if (pct == null) return "flat";
  if (pct >= thresholds.green_pct) return "up";
  if (pct <= thresholds.red_pct) return "down";
  return "flat";
}
