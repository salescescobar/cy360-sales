"use client";
import { useEffect, useState } from "react";
import { theme } from "../../lib/theme";

const BUSINESS_LINE_LABELS: Record<string, string> = {
  food_beverage: "Food & Beverage", pickleball: "Pickleball Revenue", memberships: "Memberships",
  events: "Events", lessons: "Lessons & Classes", swag: "Swag", arcade: "Arcade", sponsorships: "Sponsorships",
};

type AlertsConfig = {
  slackEnabled: boolean;
  slackChannel: string | null;
  maxPerLinePerDay: number;
  webhookConfigured: boolean;
  greenPct: number | null;
  redPct: number | null;
};
type AlertRecord = { locationSlug: string; businessLine: string; sentOn: string; direction: "up" | "down"; comparison: string; pct: number; message: string };

export default function AlertsClient() {
  const [config, setConfig] = useState<AlertsConfig | null>(null);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/alerts")
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then(data => { setConfig(data.config); setAlerts(data.alerts); })
      .catch(e => setError(String(e)));
  }, []);

  if (error) return <p role="alert" style={{ color: theme.down }}>{error}</p>;
  if (!config) return <p style={{ color: theme.textSecondary }}>Loading…</p>;

  return (
    <div style={{ fontFamily: theme.font.body, color: theme.ink }}>
      <h2 style={{ fontSize: 16 }}>Slack wiring</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <tbody>
          <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
            <td style={{ padding: 8, color: theme.textSecondary }}>Alerts enabled (config.yaml -&gt; report.alerts.slack)</td>
            <td style={{ padding: 8 }}>{config.slackEnabled ? "Yes" : "No"}</td>
          </tr>
          <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
            <td style={{ padding: 8, color: theme.textSecondary }}>Slack channel (config.yaml -&gt; alerts.slack_channel)</td>
            <td style={{ padding: 8 }}>{config.slackChannel ?? <em>not set</em>}</td>
          </tr>
          <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
            <td style={{ padding: 8, color: theme.textSecondary }}>SLACK_WEBHOOK_URL environment variable</td>
            <td style={{ padding: 8, color: config.webhookConfigured ? theme.up : theme.down }}>
              {config.webhookConfigured ? "Configured" : "Not configured — Slack pushes are skipped, alerts still record and show on the report"}
            </td>
          </tr>
          <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
            <td style={{ padding: 8, color: theme.textSecondary }}>Max pushes per line per day</td>
            <td style={{ padding: 8 }}>{config.maxPerLinePerDay}</td>
          </tr>
          <tr>
            <td style={{ padding: 8, color: theme.textSecondary }}>Thresholds</td>
            <td style={{ padding: 8 }}>green &ge; {config.greenPct ?? "—"}% · red &le; {config.redPct ?? "—"}%</td>
          </tr>
        </tbody>
      </table>

      <h2 style={{ fontSize: 16 }}>Recent alerts (alerts_sent)</h2>
      {alerts.length === 0 ? (
        <p style={{ color: theme.textSecondary }}>No alerts recorded yet — none of the tracked lines have breached a threshold on a completed day.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontFeatureSettings: theme.numericFeatures }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
              <th style={{ textAlign: "left", padding: 8 }}>Date</th>
              <th style={{ textAlign: "left", padding: 8 }}>Location</th>
              <th style={{ textAlign: "left", padding: 8 }}>Business line</th>
              <th style={{ textAlign: "left", padding: 8 }}>Comparison</th>
              <th style={{ textAlign: "right", padding: 8 }}>%</th>
              <th style={{ textAlign: "left", padding: 8 }}>Message sent to Slack</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((a, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${theme.border}` }}>
                <td style={{ padding: 8 }}>{a.sentOn}</td>
                <td style={{ padding: 8 }}>{a.locationSlug}</td>
                <td style={{ padding: 8 }}>{BUSINESS_LINE_LABELS[a.businessLine] ?? a.businessLine}</td>
                <td style={{ padding: 8 }}>{a.comparison === "prior_month" ? "prior month" : "same month last year"}</td>
                <td style={{ textAlign: "right", padding: 8, color: a.direction === "up" ? theme.up : theme.down }}>{a.pct > 0 ? "+" : ""}{a.pct}%</td>
                <td style={{ padding: 8, color: theme.textTertiary, fontSize: 13 }}>{a.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
