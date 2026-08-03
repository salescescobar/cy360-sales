"use client";
import { useEffect, useState } from "react";
import { theme } from "../../lib/theme";

type Flag = {
  id: string;
  locationSlug: string;
  scope: "day" | "month";
  date?: string | null;
  month?: string | null;
  source?: "gotab" | "courtreserve" | null;
  code: "outlier_day" | "unverified_day" | "month_unreliable";
  severity: "warn" | "error";
  message: string;
  resolved: boolean;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
};

const CODE_LABELS: Record<Flag["code"], string> = {
  outlier_day: "Outlier day",
  unverified_day: "Unverified day",
  month_unreliable: "Month unreliable",
};

export default function DataQualityClient() {
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = () => {
    fetch("/api/admin/data-quality?resolved=false")
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then(data => setFlags(data.flags))
      .catch(e => setError(String(e)));
  };

  useEffect(load, []);

  const resolve = async (id: string) => {
    setResolvingId(id);
    try {
      const res = await fetch("/api/admin/data-quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setResolvingId(null);
    }
  };

  if (error) return <p role="alert" style={{ color: theme.down }}>{error}</p>;
  if (!flags) return <p style={{ color: theme.textSecondary }}>Loading…</p>;

  return (
    <div style={{ fontFamily: theme.font.body, color: theme.ink }}>
      {flags.length === 0 ? (
        <p style={{ color: theme.textSecondary }}>No open data-quality flags.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
              <th style={{ textAlign: "left", padding: 8 }}>Location</th>
              <th style={{ textAlign: "left", padding: 8 }}>Date</th>
              <th style={{ textAlign: "left", padding: 8 }}>Code</th>
              <th style={{ textAlign: "left", padding: 8 }}>Severity</th>
              <th style={{ textAlign: "left", padding: 8 }}>Message</th>
              <th style={{ padding: 8 }} />
            </tr>
          </thead>
          <tbody>
            {flags.map(f => (
              <tr key={f.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                <td style={{ padding: 8 }}>{f.locationSlug}</td>
                <td style={{ padding: 8 }}>{f.scope === "day" ? f.date : f.month}</td>
                <td style={{ padding: 8 }}>{CODE_LABELS[f.code]}</td>
                <td style={{ padding: 8, color: f.severity === "error" ? theme.down : theme.flat, fontWeight: 700 }}>{f.severity}</td>
                <td style={{ padding: 8, color: theme.textTertiary, fontSize: 13 }}>{f.message}</td>
                <td style={{ padding: 8, textAlign: "right" }}>
                  <button onClick={() => resolve(f.id)} disabled={resolvingId === f.id}>
                    {resolvingId === f.id ? "Resolving…" : "Resolve"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
