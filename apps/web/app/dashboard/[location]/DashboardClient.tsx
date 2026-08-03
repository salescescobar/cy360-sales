"use client";
import { Fragment, useEffect, useState, type CSSProperties } from "react";
import { theme } from "../../lib/theme";
import { fmtUsd, fmtPct, trafficDirection } from "../../lib/format";

type LineRow = {
  businessLine: string;
  label: string;
  current: number;
  priorMonth: number;
  lastYear: number;
  vsPriorMonthPct: number | null;
  vsLastYearPct: number | null;
};
type GrowthReport = {
  locationSlug: string;
  recognitionThroughDate: string;
  rows: LineRow[];
  daysRow: { current: number; priorMonth: number; lastYear: number };
  comparisonLabels: { priorMonth: string; lastYear: string };
  missing: { current: string[]; priorMonth: string[]; lastYear: string[] };
  alerts: Array<{ businessLine: string; label: string; comparison: string; direction: "up" | "down"; pct: number }>;
};
type DrilldownTx = { date: string; amountCents: number; source: "gotab" | "courtreserve"; transactionType?: string | null; paymentType?: string | null };
type DrilldownItem = { item: string; amountCents: number; transactions: DrilldownTx[] };
type DrilldownGroup = { group: string; amountCents: number; items: DrilldownItem[] };
type DataQualityInfo = { hasUnresolvedError: boolean; dates: string[]; messages: string[] };

const THRESHOLDS = { green_pct: 5, red_pct: -5 }; // display only — the server (config.yaml) is authoritative

function yesterdayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** The report must open on the CURRENT calendar month, not whatever month "yesterday"
 *  happens to fall in — those only differ on the 1st, but that's exactly the day a stale
 *  month default is most misleading (h_wrong_default_month). */
function currentMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const ROLLUP_LINES = new Set(["gross_revenues", "discounts", "total"]);

function TrafficDot({ pct }: { pct: number | null }) {
  const dir = trafficDirection(pct, THRESHOLDS);
  const color = dir === "up" ? theme.up : dir === "down" ? theme.down : theme.flat;
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, marginRight: 6 }} />;
}

function ComparisonCell({ amount, pct, bold }: { amount: number; pct: number | null; bold?: boolean }) {
  return (
    <td style={{ textAlign: "right", padding: "7px 8px", fontFeatureSettings: theme.numericFeatures, whiteSpace: "nowrap" }}>
      <span style={{ fontWeight: bold ? 700 : 400 }}>{fmtUsd(amount)}</span>{" "}
      <span style={{ color: pct == null ? theme.textSecondary : trafficDirection(pct, THRESHOLDS) === "up" ? theme.up : trafficDirection(pct, THRESHOLDS) === "down" ? theme.down : theme.flat, fontSize: 12, fontWeight: 600 }}>
        <TrafficDot pct={pct} />{fmtPct(pct)}
      </span>
    </td>
  );
}

/** Gross Revenues, Discounts and Total are the answer, not just three more lines — a rule
 *  above the block and bold weight throughout separate "the 8 lines" from "the bottom line"
 *  (spec item 1). Total additionally gets a heavier rule + tinted row so it reads as final. */
function summaryRowStyle(businessLine: string): CSSProperties {
  if (businessLine === "total") {
    return { fontWeight: 700, fontSize: 15, borderTop: `2px solid ${theme.ink}`, background: theme.surfaceMuted };
  }
  if (businessLine === "gross_revenues") {
    return { fontWeight: 700, borderTop: `2px solid ${theme.border}` };
  }
  if (businessLine === "discounts") {
    return { fontWeight: 700 };
  }
  return { fontWeight: 400 };
}

/** Controlled by the parent (not local state) so the expansion path survives a reload — the
 *  parent mirrors openGroup/openItem into the URL alongside period/date/month. */
function DrilldownRows({
  groups, openGroup, openItem, onToggleGroup, onToggleItem,
}: {
  groups: DrilldownGroup[];
  openGroup: string | null;
  openItem: string | null;
  onToggleGroup: (group: string) => void;
  onToggleItem: (item: string) => void;
}) {
  if (groups.length === 0) return <tr><td colSpan={4} style={{ padding: "8px 8px 8px 32px", color: theme.textSecondary, fontSize: 13 }}>No transactions this period.</td></tr>;
  return (
    <>
      {groups.map(g => (
        <Fragment key={g.group}>
          <tr onClick={() => onToggleGroup(g.group)} style={{ cursor: "pointer", background: theme.surfaceMuted }}>
            <td style={{ padding: "8px 8px 8px 32px", color: theme.textTertiary }}>{openGroup === g.group ? "▾" : "▸"} {g.group}</td>
            <td colSpan={3} style={{ textAlign: "right", padding: "8px 8px", color: theme.textTertiary, fontFeatureSettings: theme.numericFeatures }}>{fmtUsd(g.amountCents)}</td>
          </tr>
          {openGroup === g.group && g.items.map(it => (
            <Fragment key={it.item}>
              <tr onClick={() => onToggleItem(it.item)} style={{ cursor: "pointer" }}>
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

export default function DashboardClient({ location }: { location: string }) {
  const [period, setPeriod] = useState<"day" | "month">("month");
  const [date, setDate] = useState(yesterdayIso());
  const [month, setMonth] = useState(currentMonthIso());
  const [report, setReport] = useState<GrowthReport | null>(null);
  const [dataQuality, setDataQuality] = useState<DataQualityInfo | null>(null);
  const [drilldown, setDrilldown] = useState<Record<string, DrilldownGroup[]>>({});
  const [openLine, setOpenLine] = useState<string | null>(null);
  // Drill-down depth (line -> group -> item) lives in the URL alongside period/date/month
  // (h_refresh_mid_flow) — otherwise a reload keeps the top-level view identical while
  // silently collapsing every row back to the top, which reads as lost state, not a refresh.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("period");
    const d = params.get("date");
    const m = params.get("month");
    const l = params.get("line");
    const g = params.get("group");
    const it = params.get("item");
    if (p === "month" || p === "day") setPeriod(p);
    if (d && DATE_RE.test(d)) setDate(d);
    if (m && MONTH_RE.test(m)) setMonth(m);
    if (l) setOpenLine(l);
    if (g) setOpenGroup(g);
    if (it) setOpenItem(it);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("period", period);
    if (period === "day") params.set("date", date); else params.set("month", month);
    if (openLine) params.set("line", openLine);
    if (openGroup) params.set("group", openGroup);
    if (openItem) params.set("item", openItem);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [period, date, month, openLine, openGroup, openItem]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const when = period === "day" ? date : month;
    fetch(`/api/growth-report?location=${encodeURIComponent(location)}&period=${period}&date=${encodeURIComponent(when)}`)
      .then(async r => {
        if (r.status === 401 || r.status === 403) { window.location.href = "/login"; return null; }
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then(data => { if (cancelled || data == null) return; setReport(data.report); setDrilldown(data.drilldown ?? {}); setDataQuality(data.dataQuality ?? null); })
      .catch(e => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [location, period, date, month]);

  return (
    <div style={{ fontFamily: theme.font.body, color: theme.ink, fontSize: 13.5 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: theme.space(2), marginBottom: theme.space(3) }}>
        <div role="tablist">
          <button role="tab" aria-selected={period === "day"} onClick={() => setPeriod("day")} style={tabStyle(period === "day")}>Day</button>{" "}
          <button role="tab" aria-selected={period === "month"} onClick={() => setPeriod("month")} style={tabStyle(period === "month")}>Month</button>
        </div>
        {period === "day" ? (
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        ) : (
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
        )}
      </div>

      {loading && <p style={{ color: theme.textSecondary }}>Loading…</p>}
      {error && <p role="alert" style={{ color: theme.down }}>Couldn&apos;t load the report: {error}</p>}

      {!loading && !error && report && (
        <section>
          {dataQuality?.hasUnresolvedError && (
            <div
              role="alert"
              style={{
                background: "#FBEAEA", border: `1px solid ${theme.down}`, borderRadius: theme.radius.card,
                padding: "10px 14px", margin: "0 0 10px", fontSize: 13, color: theme.ink,
              }}
            >
              <strong style={{ color: theme.down }}>These figures may be wrong.</strong>{" "}
              {dataQuality.dates.length > 0
                ? <>Unresolved data-quality issue{dataQuality.dates.length > 1 ? "s" : ""} on {dataQuality.dates.join(", ")}.</>
                : <>An unresolved data-quality issue affects this period.</>}
              {" "}An admin needs to review and resolve this in Admin → Data quality before these numbers should be trusted.
            </div>
          )}
          <p style={{ color: theme.textSecondary, fontSize: 12.5, margin: "0 0 6px" }}>
            Recognized through <strong style={{ color: theme.textTertiary }}>{report.recognitionThroughDate}</strong> — earned-by-service-date only; future bookings never included.
          </p>

          {(report.missing.current.length > 0) && (
            <div style={{ background: theme.surfaceMuted, border: `1px solid ${theme.border}`, borderRadius: theme.radius.card, padding: "6px 10px", margin: "0 0 6px", fontSize: 12, color: theme.textTertiary }}>
              <strong>Incomplete period:</strong>{" "}
              {report.missing.current.join(" · ")}
            </div>
          )}

          {report.alerts.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "0 0 6px" }}>
              {report.alerts.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", padding: "3px 8px", borderRadius: theme.radius.pill, background: a.direction === "up" ? "#EAF7EF" : "#FBEAEA", fontSize: 12 }}>
                  <TrafficDot pct={a.direction === "up" ? 100 : -100} />
                  <span>{a.label} {a.pct > 0 ? "+" : ""}{a.pct}% vs {a.comparison === "prior_month" ? "prior month" : "last year"}</span>
                </div>
              ))}
            </div>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse", fontFeatureSettings: theme.numericFeatures }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                <th style={{ textAlign: "left", padding: "5px 8px", color: theme.textSecondary, fontWeight: 400, fontSize: 12 }}>Business line</th>
                <th style={{ textAlign: "right", padding: "5px 8px", color: theme.textSecondary, fontWeight: 400, fontSize: 12 }}>This period</th>
                <th style={{ textAlign: "right", padding: "5px 8px", color: theme.textSecondary, fontWeight: 400, fontSize: 12 }}>{report.comparisonLabels.priorMonth}</th>
                <th style={{ textAlign: "right", padding: "5px 8px", color: theme.textSecondary, fontWeight: 400, fontSize: 12 }}>{report.comparisonLabels.lastYear}</th>
              </tr>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                <td style={{ padding: "3px 8px", color: theme.textTertiary, fontSize: 11 }}># Days</td>
                <td style={{ textAlign: "right", padding: "3px 8px", color: theme.textTertiary, fontSize: 11 }}>{report.daysRow.current}</td>
                <td style={{ textAlign: "right", padding: "3px 8px", color: theme.textTertiary, fontSize: 11 }}>{report.daysRow.priorMonth}</td>
                <td style={{ textAlign: "right", padding: "3px 8px", color: theme.textTertiary, fontSize: 11 }}>{report.daysRow.lastYear}</td>
              </tr>
            </thead>
            <tbody>
              {report.rows.map(row => {
                const isRollup = ROLLUP_LINES.has(row.businessLine);
                const clickable = !isRollup;
                const rowStyle = { ...summaryRowStyle(row.businessLine), cursor: clickable ? "pointer" : "default" };
                return (
                  <Fragment key={row.businessLine}>
                    <tr
                      onClick={clickable ? () => {
                        setOpenLine(openLine === row.businessLine ? null : row.businessLine);
                        setOpenGroup(null);
                        setOpenItem(null);
                      } : undefined}
                      style={rowStyle}
                    >
                      <td style={{ padding: "7px 8px", color: row.businessLine === "unmapped" ? theme.textSecondary : theme.ink }}>
                        {clickable ? (openLine === row.businessLine ? "▾ " : "▸ ") : ""}{row.label}
                      </td>
                      <td style={{ textAlign: "right", padding: "7px 8px" }}>{fmtUsd(row.current)}</td>
                      <ComparisonCell amount={row.priorMonth} pct={row.vsPriorMonthPct} bold={isRollup} />
                      <ComparisonCell amount={row.lastYear} pct={row.vsLastYearPct} bold={isRollup} />
                    </tr>
                    {openLine === row.businessLine && (
                      <DrilldownRows
                        groups={drilldown[row.businessLine] ?? []}
                        openGroup={openGroup}
                        openItem={openItem}
                        onToggleGroup={group => { setOpenGroup(openGroup === group ? null : group); setOpenItem(null); }}
                        onToggleItem={item => setOpenItem(openItem === item ? null : item)}
                      />
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          <p style={{ marginTop: 10 }}>
            <a href={`/dashboard/${location}/day/${period === "day" ? date : `${month}-01`}`}>
              Open day view →
            </a>
          </p>
        </section>
      )}
    </div>
  );
}

function tabStyle(active: boolean): CSSProperties {
  return {
    border: "none",
    background: active ? theme.clientAccent : theme.surfaceMuted,
    color: active ? "#fff" : theme.textSecondary,
    borderRadius: theme.radius.pill,
    padding: "6px 16px",
    fontFamily: theme.font.body,
    cursor: "pointer",
  };
}
