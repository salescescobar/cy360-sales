"use client";
import { useEffect, useState, type FormEvent } from "react";
import { theme } from "../../lib/theme";
import { fmtUsd } from "../../lib/format";

const BUSINESS_LINE_LABELS: Record<string, string> = {
  food_beverage: "Food & Beverage", pickleball: "Pickleball Revenue", memberships: "Memberships",
  events: "Events", lessons: "Lessons & Classes", swag: "Swag", arcade: "Arcade", sponsorships: "Sponsorships",
};

type UnmappedItem = { group: string; item: string; amountCents: number; source: "gotab" | "courtreserve" };
type Rule = { source: "gotab" | "courtreserve"; matchGroup: string | null; matchItem: string | null; businessLine: string; priority: number };

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function BusinessLinesClient({ locations }: { locations: Array<{ slug: string; name: string }> }) {
  const [location, setLocation] = useState(locations[0]?.slug ?? "");
  const [month, setMonth] = useState(thisMonth());
  const [rules, setRules] = useState<Rule[]>([]);
  const [unmapped, setUnmapped] = useState<UnmappedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [manualSource, setManualSource] = useState<"gotab" | "courtreserve">("courtreserve");
  const [manualGroup, setManualGroup] = useState("");
  const [manualItem, setManualItem] = useState("");
  const [manualLine, setManualLine] = useState("");
  const [manualSaving, setManualSaving] = useState(false);
  const [manualStatus, setManualStatus] = useState<string | null>(null);

  function load() {
    if (!location || !month) return;
    setError(null);
    fetch(`/api/admin/business-lines?location=${encodeURIComponent(location)}&month=${encodeURIComponent(month)}`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then(data => { setRules(data.rules); setUnmapped(data.unmapped); })
      .catch(e => setError(String(e)));
  }

  useEffect(load, [location, month]);

  async function assign(item: UnmappedItem, businessLine: string) {
    setAssigning(`${item.group}::${item.item}`);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/business-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: item.source, matchGroup: item.group, matchItem: item.item, businessLine, priority: 5 }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setStatus(`Assigned "${item.item}" to ${BUSINESS_LINE_LABELS[businessLine] ?? businessLine}.`);
      load();
    } catch (e) {
      setStatus(`Couldn't assign: ${e}`);
    } finally {
      setAssigning(null);
    }
  }

  async function submitManualRule(e: FormEvent) {
    e.preventDefault();
    setManualSaving(true);
    setManualStatus(null);
    try {
      const res = await fetch("/api/admin/business-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: manualSource,
          matchGroup: manualGroup.trim() || null,
          matchItem: manualItem.trim() || null,
          businessLine: manualLine,
          priority: 5,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setManualStatus(`Rule added: ${manualSource}/${manualGroup || "any group"}/${manualItem || "any item"} → ${BUSINESS_LINE_LABELS[manualLine] ?? manualLine}.`);
      setManualGroup(""); setManualItem(""); setManualLine("");
      load();
    } catch (e) {
      setManualStatus(`Couldn't add rule: ${e}`);
    } finally {
      setManualSaving(false);
    }
  }

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

      {error && <p role="alert" style={{ color: theme.down }}>{error}</p>}
      {status && <p role="status">{status}</p>}

      <h2 style={{ fontSize: 16 }}>Unmapped this period</h2>
      {unmapped.length === 0 ? (
        <p style={{ color: theme.textSecondary }}>Nothing unmapped for this location/month.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontFeatureSettings: theme.numericFeatures }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
              <th style={{ textAlign: "left", padding: 8 }}>Source</th>
              <th style={{ textAlign: "left", padding: 8 }}>Group</th>
              <th style={{ textAlign: "left", padding: 8 }}>Item</th>
              <th style={{ textAlign: "right", padding: 8 }}>Amount</th>
              <th style={{ textAlign: "left", padding: 8 }}>Assign to</th>
            </tr>
          </thead>
          <tbody>
            {unmapped.map((u, i) => (
              <tr key={i}>
                <td style={{ padding: 8 }}>{u.source}</td>
                <td style={{ padding: 8 }}>{u.group}</td>
                <td style={{ padding: 8 }}>{u.item}</td>
                <td style={{ textAlign: "right", padding: 8 }}>{fmtUsd(u.amountCents)}</td>
                <td style={{ padding: 8 }}>
                  <select
                    disabled={assigning === `${u.group}::${u.item}`}
                    defaultValue=""
                    onChange={e => { if (e.target.value) assign(u, e.target.value); }}
                  >
                    <option value="" disabled>Choose a business line…</option>
                    {Object.entries(BUSINESS_LINE_LABELS).map(([slug, label]) => <option key={slug} value={slug}>{label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Add a mapping rule manually</h2>
      <p style={{ color: theme.textSecondary, fontSize: 13 }}>
        Detected unmapped items above come from this period&apos;s actual data — if nothing is
        unmapped right now, that just means everything this period already matched a rule.
        Criterion #4&apos;s write path (assign a source item to a business line) doesn&apos;t
        have to wait for one: add the rule directly here, e.g. ahead of a source item you know
        is coming, or to correct one already mapped to the wrong line.
      </p>
      {manualStatus && <p role="status">{manualStatus}</p>}
      <form onSubmit={submitManualRule} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 24 }}>
        <label>
          Source<br />
          <select value={manualSource} onChange={e => setManualSource(e.target.value as "gotab" | "courtreserve")}>
            <option value="courtreserve">courtreserve</option>
            <option value="gotab">gotab</option>
          </select>
        </label>
        <label>
          Group (blank = any)<br />
          <input value={manualGroup} onChange={e => setManualGroup(e.target.value)} placeholder="e.g. Package" />
        </label>
        <label>
          Item (blank = any, %substring% allowed)<br />
          <input value={manualItem} onChange={e => setManualItem(e.target.value)} placeholder="e.g. %birthday%" />
        </label>
        <label>
          Business line<br />
          <select value={manualLine} onChange={e => setManualLine(e.target.value)} required>
            <option value="" disabled>Choose…</option>
            {Object.entries(BUSINESS_LINE_LABELS).map(([slug, label]) => <option key={slug} value={slug}>{label}</option>)}
          </select>
        </label>
        <button type="submit" disabled={manualSaving || !manualLine}>{manualSaving ? "Adding…" : "Add rule"}</button>
      </form>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Current mapping rules</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
            <th style={{ textAlign: "left", padding: 8 }}>Source</th>
            <th style={{ textAlign: "left", padding: 8 }}>Group</th>
            <th style={{ textAlign: "left", padding: 8 }}>Item</th>
            <th style={{ textAlign: "left", padding: 8 }}>Business line</th>
            <th style={{ textAlign: "right", padding: 8 }}>Priority</th>
          </tr>
        </thead>
        <tbody>
          {rules.sort((a, b) => a.priority - b.priority).map((r, i) => (
            <tr key={i}>
              <td style={{ padding: 8 }}>{r.source}</td>
              <td style={{ padding: 8 }}>{r.matchGroup ?? <em>any</em>}</td>
              <td style={{ padding: 8 }}>{r.matchItem ?? <em>any</em>}</td>
              <td style={{ padding: 8 }}>{BUSINESS_LINE_LABELS[r.businessLine] ?? r.businessLine}</td>
              <td style={{ textAlign: "right", padding: 8 }}>{r.priority}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
