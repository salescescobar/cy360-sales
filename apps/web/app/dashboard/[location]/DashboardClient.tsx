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
  priorPeriod: { totalGrossCents: number; pctChange: number | null } | null;
};

const fmtUsd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

function yesterdayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default function DashboardClient({ location }: { location: string }) {
  const [period, setPeriod] = useState<"day" | "month">("day");
  const [date, setDate] = useState(yesterdayIso());
  const [month, setMonth] = useState(yesterdayIso().slice(0, 7));
  const [daily, setDaily] = useState<DailyMetrics | null>(null);
  const [monthly, setMonthly] = useState<MonthlyMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const when = period === "day" ? date : month;
    fetch(`/api/metrics?location=${encodeURIComponent(location)}&period=${period}&date=${encodeURIComponent(when)}`)
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`); return r.json(); })
      .then(data => { if (period === "day") setDaily(data); else setMonthly(data); })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
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
                  Prior month: {fmtUsd(monthly.priorPeriod.totalGrossCents)}
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
