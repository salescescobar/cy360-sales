"use client";
import { Fragment, useEffect, useState } from "react";
import { theme } from "../../lib/theme";
import { fmtUsd } from "../../lib/format";

type ReconciliationRow = { feeCategory: string; transactionType: string; recognizedCents: number; recognizedTaxCents: number; paymentBasisCents: number; paymentBasisTaxCents: number; deltaCents: number };
type CategoryGroup = { feeCategory: string; recognizedCents: number; recognizedTaxCents: number; paymentBasisCents: number; paymentBasisTaxCents: number; deltaCents: number; rows: ReconciliationRow[] };
type Driver = { kind: "only_payment_basis" | "only_recognized" | "multi_transaction_type" | "timing"; feeCategory: string; amountCents: number; transactionTypes?: string[] };
type Summary = { rows: ReconciliationRow[]; groups: CategoryGroup[]; drivers: Driver[]; totalRecognizedCents: number; totalPaymentBasisCents: number; totalDeltaCents: number };

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function driverText(d: Driver): string {
  switch (d.kind) {
    case "only_payment_basis":
      return `${d.feeCategory} appears only on payment basis: ${fmtUsd(d.amountCents)}`;
    case "only_recognized":
      return `${d.feeCategory} appears only on recognized (service-date) basis: ${fmtUsd(d.amountCents)}`;
    case "multi_transaction_type":
      return `${d.feeCategory} is recorded under ${d.transactionTypes?.length} transaction types (${d.transactionTypes?.join(", ")})`;
    case "timing":
      return `Timing: ${d.feeCategory} is recognized in one month but paid in another — delta ${fmtUsd(d.amountCents)}`;
  }
}

function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 180, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radius.card, padding: theme.space(4) }}>
      <div style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, fontFeatureSettings: theme.numericFeatures, color: color ?? theme.ink }}>{value}</div>
    </div>
  );
}

export default function ReconciliationClient({ locations }: { locations: Array<{ slug: string; name: string }> }) {
  const [location, setLocation] = useState(locations[0]?.slug ?? "");
  const [month, setMonth] = useState(thisMonth());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!location || !month) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOpenCategory(null);
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
          {/* The answer first: three totals, not the matrix (spec item 2). */}
          <div style={{ display: "flex", gap: theme.space(3), flexWrap: "wrap", margin: `${theme.space(3)} 0` }}>
            <StatTile label="Total recognized" value={fmtUsd(summary.totalRecognizedCents)} />
            <StatTile label="Total payment-basis" value={fmtUsd(summary.totalPaymentBasisCents)} />
            <StatTile
              label="Delta"
              value={fmtUsd(summary.totalDeltaCents)}
              color={summary.totalDeltaCents === 0 ? theme.ink : theme.down}
            />
          </div>

          {summary.drivers.length > 0 && (
            <div style={{ margin: `0 0 ${theme.space(4)}` }}>
              <h2 style={{ fontSize: 14, color: theme.textTertiary, fontFamily: theme.font.body, fontWeight: 700, margin: "0 0 6px" }}>
                Why they differ
              </h2>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {summary.drivers.map((d, i) => (
                  <li
                    key={i}
                    style={{
                      display: "flex", alignItems: "baseline", gap: 8, padding: "8px 12px",
                      background: theme.surfaceMuted, borderRadius: theme.radius.card, marginBottom: 6, fontSize: 13.5,
                    }}
                  >
                    <span style={{ color: theme.clientAccent, fontWeight: 700 }}>•</span>
                    <span>{driverText(d)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <h2 style={{ fontSize: 14, color: theme.textTertiary, fontFamily: theme.font.body, fontWeight: 700, margin: "0 0 6px" }}>
            Detail by fee category
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFeatureSettings: theme.numericFeatures }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                <th style={{ textAlign: "left", padding: 8, fontWeight: 400, fontSize: 12, color: theme.textSecondary }}>FeeCategory</th>
                <th style={{ textAlign: "right", padding: 8, fontWeight: 400, fontSize: 12, color: theme.textSecondary }}>Recognized</th>
                <th style={{ textAlign: "right", padding: 8, fontWeight: 400, fontSize: 12, color: theme.textSecondary }}>Tax</th>
                <th style={{ textAlign: "right", padding: 8, fontWeight: 400, fontSize: 12, color: theme.textSecondary }}>Payment-basis</th>
                <th style={{ textAlign: "right", padding: 8, fontWeight: 400, fontSize: 12, color: theme.textSecondary }}>Tax</th>
                <th style={{ textAlign: "right", padding: 8, fontWeight: 400, fontSize: 12, color: theme.textSecondary }}>Delta</th>
              </tr>
            </thead>
            <tbody>
              {summary.groups.length === 0 && <tr><td colSpan={6} style={{ padding: 8, color: theme.textSecondary }}>No rows for this location/month.</td></tr>}
              {summary.groups.map(g => {
                const expandable = g.rows.length > 1;
                const open = openCategory === g.feeCategory;
                return (
                  <Fragment key={g.feeCategory}>
                    <tr
                      onClick={expandable ? () => setOpenCategory(open ? null : g.feeCategory) : undefined}
                      style={{ cursor: expandable ? "pointer" : "default", fontWeight: 700, borderTop: `1px solid ${theme.border}` }}
                    >
                      <td style={{ padding: 8 }}>{expandable ? (open ? "▾ " : "▸ ") : ""}{g.feeCategory}</td>
                      <td style={{ textAlign: "right", padding: 8 }}>{fmtUsd(g.recognizedCents)}</td>
                      <td style={{ textAlign: "right", padding: 8 }}>{fmtUsd(g.recognizedTaxCents)}</td>
                      <td style={{ textAlign: "right", padding: 8 }}>{fmtUsd(g.paymentBasisCents)}</td>
                      <td style={{ textAlign: "right", padding: 8 }}>{fmtUsd(g.paymentBasisTaxCents)}</td>
                      <td style={{ textAlign: "right", padding: 8, color: g.deltaCents === 0 ? theme.ink : theme.down }}>{fmtUsd(g.deltaCents)}</td>
                    </tr>
                    {open && g.rows.map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: "6px 8px 6px 24px", fontSize: 12.5, color: theme.textSecondary }}>{r.transactionType}</td>
                        <td style={{ textAlign: "right", padding: "6px 8px", fontSize: 12.5, color: theme.textSecondary }}>{fmtUsd(r.recognizedCents)}</td>
                        <td style={{ textAlign: "right", padding: "6px 8px", fontSize: 12.5, color: theme.textSecondary }}>{fmtUsd(r.recognizedTaxCents)}</td>
                        <td style={{ textAlign: "right", padding: "6px 8px", fontSize: 12.5, color: theme.textSecondary }}>{fmtUsd(r.paymentBasisCents)}</td>
                        <td style={{ textAlign: "right", padding: "6px 8px", fontSize: 12.5, color: theme.textSecondary }}>{fmtUsd(r.paymentBasisTaxCents)}</td>
                        <td style={{ textAlign: "right", padding: "6px 8px", fontSize: 12.5, color: r.deltaCents === 0 ? theme.textSecondary : theme.down }}>{fmtUsd(r.deltaCents)}</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
