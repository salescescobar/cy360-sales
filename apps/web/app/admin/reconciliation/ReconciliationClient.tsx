"use client";
import { useEffect, useState } from "react";
import { theme } from "../../lib/theme";
import { fmtUsd } from "../../lib/format";

type ReconciliationRow = { feeCategory: string; transactionType: string; recognizedCents: number; recognizedTaxCents: number; paymentBasisCents: number; paymentBasisTaxCents: number; deltaCents: number };
type Summary = { rows: ReconciliationRow[]; totalRecognizedCents: number; totalPaymentBasisCents: number; totalDeltaCents: number };

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function ReconciliationClient({ locations }: { locations: Array<{ slug: string; name: string }> }) {
  const [location, setLocation] = useState(locations[0]?.slug ?? "");
  const [month, setMonth] = useState(thisMonth());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!location || !month) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/reconciliation?location=${encodeURIComponent(location)}&month=${encodeURIComponent(month)}`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then(data => { if (!cancelled) setSummary(data); })
      .catch(e => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [location, month]);

  return (
    <div style={{ fontFamily: theme.font.body, color: theme.ink }}>
      <p>
        <label>
          Location{" "}
          <select value={location} onChange={e => setLocation(e.target.value)}>
            {locations.map(l => <option key={l.slug} value={l.slug}>{l.name}</option>)}
          </select>
        </label>{" "}
        <label>
          Month{" "}
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
        </label>
      </p>

      {loading && <p style={{ color: theme.textSecondary }}>Loading…</p>}
      {error && <p role="alert" style={{ color: theme.down }}>{error}</p>}

      {summary && (
        <>
          <p>
            <strong>Total recognized:</strong> {fmtUsd(summary.totalRecognizedCents)} ·{" "}
            <strong>Total payment-basis:</strong> {fmtUsd(summary.totalPaymentBasisCents)} ·{" "}
            <strong>Delta:</strong> <span style={{ color: summary.totalDeltaCents === 0 ? theme.ink : theme.down }}>{fmtUsd(summary.totalDeltaCents)}</span>
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFeatureSettings: theme.numericFeatures }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                <th style={{ textAlign: "left", padding: 8 }}>FeeCategory</th>
                <th style={{ textAlign: "left", padding: 8 }}>TransactionType</th>
                <th style={{ textAlign: "right", padding: 8 }}>Recognized</th>
                <th style={{ textAlign: "right", padding: 8 }}>Tax</th>
                <th style={{ textAlign: "right", padding: 8 }}>Payment-basis</th>
                <th style={{ textAlign: "right", padding: 8 }}>Tax</th>
                <th style={{ textAlign: "right", padding: 8 }}>Delta</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.length === 0 && <tr><td colSpan={7} style={{ padding: 8, color: theme.textSecondary }}>No rows for this location/month.</td></tr>}
              {summary.rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: 8 }}>{r.feeCategory}</td>
                  <td style={{ padding: 8 }}>{r.transactionType}</td>
                  <td style={{ textAlign: "right", padding: 8 }}>{fmtUsd(r.recognizedCents)}</td>
                  <td style={{ textAlign: "right", padding: 8 }}>{fmtUsd(r.recognizedTaxCents)}</td>
                  <td style={{ textAlign: "right", padding: 8 }}>{fmtUsd(r.paymentBasisCents)}</td>
                  <td style={{ textAlign: "right", padding: 8 }}>{fmtUsd(r.paymentBasisTaxCents)}</td>
                  <td style={{ textAlign: "right", padding: 8, color: r.deltaCents === 0 ? theme.ink : theme.down }}>{fmtUsd(r.deltaCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
