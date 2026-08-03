"use client";
import { Fragment, useEffect, useState } from "react";
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
type DrilldownTx = { date: string; amountCents: number; source: "gotab" | "courtreserve"; transactionType?: string | null; paymentType?: string | null };
type DrilldownItem = { item: string; amountCents: number; transactions: DrilldownTx[] };
type DrilldownGroup = { group: string; amountCents: number; items: DrilldownItem[] };
type BySource = { gotabGrossCents: number | null; courtreserveGrossCents: number | null };

const THRESHOLDS = { green_pct: 5, red_pct: -5 };
const ROLLUP_LINES = new Set(["gross_revenues", "discounts", "total"]);

function TrafficDot({ pct }: { pct: number | null }) {
  const dir = trafficDirection(pct, THRESHOLDS);
  const color = dir === "up" ? theme.up : dir === "down" ? theme.down : theme.flat;
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, marginRight: 6 }} />;
}

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

/** Business line -> group -> item -> transactions, three clicks deep (criterion #3): this
 *  row's own click opens groups (1), a group row opens items (2), an item row opens its
 *  transactions (3). */
function DrilldownRows({ groups }: { groups: DrilldownGroup[] }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<string | null>(null);
  if (groups.length === 0) return <tr><td colSpan={4} style={{ padding: "8px 8px 8px 32px", color: theme.textSecondary, fontSize: 13 }}>No transactions this period.</td></tr>;
  return (
    <>
      {groups.map(g => (
        <Fragment key={g.group}>
          <tr onClick={() => setOpenGroup(openGroup === g.group ? null : g.group)} style={{ cursor: "pointer", background: theme.surfaceMuted }}>
            <td style={{ padding: "8px 8px 8px 32px", color: theme.textTertiary }}>{openGroup === g.group ? "▾" : "▸"} {g.group}</td>
            <td colSpan={3} style={{ textAlign: "right", padding: "8px 8px", color: theme.textTertiary, fontFeatureSettings: theme.numericFeatures }}>{fmtUsd(g.amountCents)}</td>
          </tr>
          {openGroup === g.group && g.items.map(it => (
            <Fragment key={it.item}>
              <tr onClick={() => setOpenItem(openItem === it.item ? null : it.item)} style={{ cursor: "pointer" }}>
                <td style={{ padding: "6px 8px 6px 56px", color: theme.textSecondary, fontSize: 13 }}>{openItem === it.item ? "▾" : "▸"} {it.item}</td>
                <td colSpan={3} style={{ textAlign: "right", padding: "6px 8px", color: theme.textSecondary, fontSize: 13, fontFeatureSettings: theme.numericFeatures }}>{fmtUsd(it.amountCents)}</td>
              </tr>
              {openItem === it.item && it.transactions.slice(0, 50).map((tx, i) => (
                <tr key={i}>
                  <td style={{ padding: "3px 8px 3px 80px", color: theme.textSecondary, fontSize: 12 }}>{tx.date} · {tx.source}{tx.paymentType ? ` · ${tx.paymentType}` : ""}</td>
                  <td colSpan={3} style={{ textAlign: "right", padding: "3px 8px", color: theme.textSecondary, fontSize: 12, fontFeatureSettings: theme.numericFeatures }}>{fmtUsd(tx.amountCents)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </Fragment>
      ))}
    </>
  );
}

export default function DayViewClient({ location, date }: { location: string; date: string }) {
  const [report, setReport] = useState<GrowthReport | null>(null);
  const [drilldown, setDrilldown] = useState<Record<string, DrilldownGroup[]>>({});
  const [bySource, setBySource] = useState<BySource | null>(null);
  const [hourly, setHourly] = useState<{ courtreserve: HourlyBucket[]; gotabAvailable: boolean } | null>(null);
  const [openLine, setOpenLine] = useState<string | null>(null);
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
      .then(data => { if (cancelled || data == null) return; setReport(data.report); setDrilldown(data.drilldown ?? {}); setHourly(data.hourly); setBySource(data.bySource ?? null); })
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

      {bySource && (bySource.gotabGrossCents != null || bySource.courtreserveGrossCents != null) && (
        <p style={{ color: theme.textTertiary, fontSize: 13 }}>
          By source — GoTab: <strong>{fmtUsd(bySource.gotabGrossCents)}</strong> · CourtReserve: <strong>{fmtUsd(bySource.courtreserveGrossCents)}</strong>
        </p>
      )}

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
            const clickable = !ROLLUP_LINES.has(row.businessLine);
            return (
              <Fragment key={row.businessLine}>
                <tr
                  onClick={clickable ? () => setOpenLine(openLine === row.businessLine ? null : row.businessLine) : undefined}
                  style={{ cursor: clickable ? "pointer" : "default", fontWeight: isGrossOrTotal ? 700 : 400, borderTop: isGrossOrTotal ? `1px solid ${theme.border}` : undefined }}
                >
                  <td style={{ padding: "8px", color: row.businessLine === "unmapped" ? theme.textSecondary : theme.ink }}>
                    {clickable ? (openLine === row.businessLine ? "▾ " : "▸ ") : ""}{row.label}
                  </td>
                  <td style={{ textAlign: "right", padding: "8px" }}>{fmtUsd(row.current)}</td>
                  <td style={{ textAlign: "right", padding: "8px" }}>
                    {fmtUsd(row.priorMonth)}{" "}
                    <span style={{ fontSize: 12, color: row.vsPriorMonthPct == null ? theme.textSecondary : trafficDirection(row.vsPriorMonthPct, THRESHOLDS) === "up" ? theme.up : trafficDirection(row.vsPriorMonthPct, THRESHOLDS) === "down" ? theme.down : theme.flat }}>
                      <TrafficDot pct={row.vsPriorMonthPct} />{fmtPct(row.vsPriorMonthPct)}
                    </span>
                  </td>
                  <td style={{ textAlign: "right", padding: "8px" }}>
                    {fmtUsd(row.lastYear)}{" "}
                    <span style={{ fontSize: 12, color: row.vsLastYearPct == null ? theme.textSecondary : trafficDirection(row.vsLastYearPct, THRESHOLDS) === "up" ? theme.up : trafficDirection(row.vsLastYearPct, THRESHOLDS) === "down" ? theme.down : theme.flat }}>
                      <TrafficDot pct={row.vsLastYearPct} />{fmtPct(row.vsLastYearPct)}
                    </span>
                  </td>
                </tr>
                {openLine === row.businessLine && <DrilldownRows groups={drilldown[row.businessLine] ?? []} />}
              </Fragment>
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
