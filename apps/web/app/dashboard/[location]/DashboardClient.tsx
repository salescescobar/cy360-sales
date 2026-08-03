"use client";
import { useEffect, useState } from "react";

type DailyMetrics = {
  date: string;
  status: "complete" | "incomplete";
  gotabGrossCents: number;
  courtreserveGrossCents: number;
  totalGrossCents: number;
  breakdown: Record<string, number>;
};
type MonthlyMetrics = {
  month: string;
  totalGrossCents: number;
  gotabGrossCents: number;
  courtreserveGrossCents: number;
  completeDays: number;
  incompleteDays: number;
  breakdown: Record<string, number>;
  priorPeriod: { totalGrossCents: number; pctChange: number | null; label: string } | null;
};

const fmtUsd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

function yesterdayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

export default function DashboardClient({ location }: { location: string }) {
  const [period, setPeriod] = useState<"day" | "month">("day");
  const [date, setDate] = useState(yesterdayIso());
  const [month, setMonth] = useState(yesterdayIso().slice(0, 7));
  const [daily, setDaily] = useState<DailyMetrics | null>(null);
  const [monthly, setMonthly] = useState<MonthlyMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore whatever tab/date the manager had selected before a reload — a reload should
  // never silently revert them to Day/today.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("period");
    const d = params.get("date");
    const m = params.get("month");
    if (p === "month" || p === "day") setPeriod(p);
    if (d && DATE_RE.test(d)) setDate(d);
    if (m && MONTH_RE.test(m)) setMonth(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL in sync so a reload (or a shared link) lands back on the same view.
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("period", period);
    if (period === "day") params.set("date", date); else params.set("month", month);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [period, date, month]);

  useEffect(() => {
    let cancelled = false; // ignore a slower, now-stale request that resolves after a newer one
    setLoading(true);
    setError(null);
    const when = period === "day" ? date : month;
    fetch(`/api/metrics?location=${encodeURIComponent(location)}&period=${period}&date=${encodeURIComponent(when)}`)
      .then(async r => {
        // A session that was valid on page load can go stale mid-visit (cookie cleared,
        // secret rotated, account removed elsewhere). Never show that as a raw fetch
        // error — send the manager back to sign in, the same place a fresh visit lands.
        if (r.status === 401 || r.status === 403) {
          window.location.href = "/login";
          return null;
        }
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then(data => { if (cancelled || data == null) return; if (period === "day") setDaily(data); else setMonthly(data); })
      .catch(e => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [location, period, date, month]);

  return (
    <div>
      <div role="tablist" style={{ marginBottom: 16 }}>
        <button role="tab" aria-selected={period === "day"} onClick={() => setPeriod("day")}>Day</button>{" "}
        <button role="tab" aria-selected={period === "month"} onClick={() => setPeriod("month")}>Month</button>
      </div>

      {period === "day" ? (
        <p><input type="date" value={date} onChange={e => setDate(e.target.value)} /></p>
      ) : (
        <p><input type="month" value={month} onChange={e => setMonth(e.target.value)} /></p>
      )}

      {loading && <p>Loading…</p>}
      {error && <p role="alert">Couldn&apos;t load metrics: {error}</p>}

      {!loading && !error && period === "day" && daily && (
        <section>
          <h2>{daily.date} — {daily.status === "complete" ? "Complete" : "Incomplete (excluded from comparatives)"}</h2>
          {daily.totalGrossCents === 0 && daily.status === "incomplete" ? (
            <p>No sales loaded yet for this day.</p>
          ) : (
            <>
              <p>Total: {fmtUsd(daily.totalGrossCents)}</p>
              <p>GoTab (F&amp;B): {fmtUsd(daily.gotabGrossCents)}</p>
              <p>CourtReserve (courts): {fmtUsd(daily.courtreserveGrossCents)}</p>
              <ul>
                {Object.entries(daily.breakdown).map(([k, v]) => <li key={k}>{k}: {fmtUsd(v)}</li>)}
              </ul>
            </>
          )}
        </section>
      )}

      {!loading && !error && period === "month" && monthly && (
        <section>
          <h2>{monthly.month}</h2>
          {monthly.completeDays === 0 ? (
            <p>No complete days loaded yet this month.</p>
          ) : (
            <>
              <p>Total: {fmtUsd(monthly.totalGrossCents)}</p>
              <p>GoTab (F&amp;B): {fmtUsd(monthly.gotabGrossCents)}</p>
              <p>CourtReserve (courts): {fmtUsd(monthly.courtreserveGrossCents)}</p>
              <p>{monthly.completeDays} complete day(s), {monthly.incompleteDays} incomplete (excluded)</p>
              {monthly.priorPeriod && (
                <p>
                  {monthly.priorPeriod.label}: {fmtUsd(monthly.priorPeriod.totalGrossCents)}
                  {monthly.priorPeriod.pctChange != null ? ` (${monthly.priorPeriod.pctChange > 0 ? "+" : ""}${monthly.priorPeriod.pctChange}%)` : ""}
                </p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
