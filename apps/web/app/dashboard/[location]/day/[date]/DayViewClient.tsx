"use client";
import { useEffect, useState } from "react";
import { theme } from "../../../../lib/theme";
import { fmtUsd, fmtPct, trafficDirection } from "../../../../lib/format";

type LineRow = { businessLine: string; label: string; current: number; priorMonth: number; lastYear: number; vsPriorMonthPct: number | null; vsLastYearPct: number | null };
type GrowthReport = {
  recognitionThroughDate: string;
  rows: LineRow[];
  daysRow: { current: number; priorMonth: number; lastYear: number };
  comparisonLabels: { priorMonth: string; lastYear: string };
  missing: { current: string[] };
};
type HourlyBucket = { hour: number; amountCents: number };

const THRESHOLDS = { green_pct: 5, red_pct: -5 };

function HourlyChart({ buckets }: { buckets: HourlyBucket[] }) {
  if (buckets.length === 0) return <p style={{ color: theme.textSecondary, fontSize: 13 }}>No hourly data available for this day.</p>;
  const max = Math.max(...buckets.map(b => b.amountCents), 1);
  const byHour = new Map(buckets.map(b => [b.hour, b.amountCents]));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120, padding: "8px 0" }}>
      {Array.from({ length: 24 }, (_, hour) => {
        const cents = byHour.get(hour) ?? 0;
        return (
          <div key={hour} title={`${hour}:00 — ${fmtUsd(cents)}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: "100%", height: Math.max(2, (cents / max) * 100), background: cents > 0 ? theme.clientAccent : theme.border, borderRadius: 2 }} />
            {hour % 4 === 0 && <span style={{ fontSize: 9, color: theme.textTertiary, marginTop: 2 }}>{hour}</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function DayViewClient({ location, date }: { location: string; date: string }) {
  const [report, setReport] = useState<GrowthReport | null>(null);
  const [hourly, setHourly] = useState<{ courtreserve: HourlyBucket[]; gotabAvailable: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/growth-report?location=${encodeURIComponent(location)}&period=day&date=${encodeURIComponent(date)}`)
      .then(async r => {
        if (r.status === 401 || r.status === 403) { window.location.href = "/login"; return null; }
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then(data => { if (cancelled || data == null) return; setReport(data.report); setHourly(data.hourly); })
      .catch(e => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [location, date]);

  if (loading) return <p style={{ color: theme.textSecondary }}>Loading…</p>;
  if (error) return <p role="alert" style={{ color: theme.down }}>Couldn&apos;t load the day view: {error}</p>;
  if (!report) return null;

  return (
    <div style={{ fontFamily: theme.font.body, color: theme.ink }}>
      <p style={{ color: theme.textSecondary, fontSize: 14 }}>Recognized revenue through <strong>{report.recognitionThroughDate}</strong>.</p>

      {report.missing.current.length > 0 && (
        <div style={{ background: theme.surfaceMuted, border: `1px solid ${theme.border}`, borderRadius: theme.radius.card, padding: theme.space(3), margin: `${theme.space(3)} 0`, fontSize: 13, color: theme.textTertiary }}>
          <strong>Incomplete day:</strong>
          <ul style={{ margin: "4px 0 0 18px" }}>{report.missing.current.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontFeatureSettings: theme.numericFeatures }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
            <th style={{ textAlign: "left", padding: "8px", color: theme.textSecondary, fontWeight: 400, fontSize: 13 }}>Business line</th>
            <th style={{ textAlign: "right", padding: "8px", color: theme.textSecondary, fontWeight: 400, fontSize: 13 }}>{date}</th>
            <th style={{ textAlign: "right", padding: "8px", color: theme.textSecondary, fontWeight: 400, fontSize: 13 }}>{report.comparisonLabels.priorMonth}</th>
            <th style={{ textAlign: "right", padding: "8px", color: theme.textSecondary, fontWeight: 400, fontSize: 13 }}>{report.comparisonLabels.lastYear}</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map(row => {
            const isGrossOrTotal = row.businessLine === "gross_revenues" || row.businessLine === "total";
            return (
              <tr key={row.businessLine} style={{ fontWeight: isGrossOrTotal ? 700 : 400, borderTop: isGrossOrTotal ? `1px solid ${theme.border}` : undefined }}>
                <td style={{ padding: "8px" }}>{row.label}</td>
                <td style={{ textAlign: "right", padding: "8px" }}>{fmtUsd(row.current)}</td>
                <td style={{ textAlign: "right", padding: "8px" }}>
                  {fmtUsd(row.priorMonth)}{" "}
                  <span style={{ fontSize: 12, color: row.vsPriorMonthPct == null ? theme.textSecondary : trafficDirection(row.vsPriorMonthPct, THRESHOLDS) === "up" ? theme.up : trafficDirection(row.vsPriorMonthPct, THRESHOLDS) === "down" ? theme.down : theme.flat }}>
                    {fmtPct(row.vsPriorMonthPct)}
                  </span>
                </td>
                <td style={{ textAlign: "right", padding: "8px" }}>
                  {fmtUsd(row.lastYear)}{" "}
                  <span style={{ fontSize: 12, color: row.vsLastYearPct == null ? theme.textSecondary : trafficDirection(row.vsLastYearPct, THRESHOLDS) === "up" ? theme.up : trafficDirection(row.vsLastYearPct, THRESHOLDS) === "down" ? theme.down : theme.flat }}>
                    {fmtPct(row.vsLastYearPct)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 style={{ marginTop: 24, fontSize: 15, color: theme.textTertiary }}>Hourly curve — CourtReserve</h3>
      <HourlyChart buckets={hourly?.courtreserve ?? []} />
      <p style={{ fontSize: 12, color: theme.textSecondary }}>GoTab hourly detail is not available — its ingestion is a daily summary only (spec section 3).</p>
    </div>
  );
}
