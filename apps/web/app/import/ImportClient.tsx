"use client";
import { useRef, useState } from "react";

type LocationInfo = { slug: string; name: string };

type PreviewDay = {
  date: string;
  totalGrossCents: number;
  count: number;
  countLabel: "transactions" | "reservations";
  breakdown: Record<string, number>;
  willReplace: boolean;
};

type Preview = { source: "gotab" | "courtreserve"; location: string; filename: string; days: PreviewDay[] };

const fmtUsd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function ImportClient({ locations }: { locations: LocationInfo[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [location, setLocation] = useState(locations[0]?.slug ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<{ dates: string[]; replaced: string[] } | null>(null);

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setConfirmed(null);
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Choose a CSV file first."); return; }
    setBusy(true);
    try {
      const body = new FormData();
      body.set("location", location);
      body.set("file", file);
      const res = await fetch("/api/import/preview", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? `HTTP ${res.status}`); setPreview(null); return; }
      setPreview(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    const file = fileRef.current?.files?.[0];
    if (!file || !preview) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("location", location);
      body.set("file", file);
      const res = await fetch("/api/import/confirm", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? `HTTP ${res.status}`); return; }
      setConfirmed({ dates: data.dates, replaced: data.replaced });
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={handlePreview}>
        <label style={{ display: "block", margin: "8px 0" }}>
          Location
          <br />
          <select value={location} onChange={e => { setLocation(e.target.value); setPreview(null); }}>
            {locations.map(l => <option key={l.slug} value={l.slug}>{l.name}</option>)}
          </select>
        </label>
        <label style={{ display: "block", margin: "8px 0" }}>
          GoTab or CourtReserve CSV export
          <br />
          <input ref={fileRef} type="file" accept=".csv,text/csv" required onChange={() => { setPreview(null); setConfirmed(null); }} />
        </label>
        <button type="submit" disabled={busy}>Preview</button>
      </form>

      {error && <p role="alert">{error}</p>}

      {confirmed && (
        <p role="status">
          Saved {confirmed.dates.length} day(s): {confirmed.dates.join(", ")}.
          {confirmed.replaced.length > 0 && ` Replaced existing data for: ${confirmed.replaced.join(", ")}.`}
          {" "}<a href={`/dashboard/${location}`}>View dashboard</a>.
        </p>
      )}

      {preview && (
        <section>
          <h2>Preview — {preview.source === "gotab" ? "GoTab" : "CourtReserve"} · {preview.filename}</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Total</th><th>Count</th><th>Breakdown</th><th></th></tr>
            </thead>
            <tbody>
              {preview.days.map(d => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td>{fmtUsd(d.totalGrossCents)}</td>
                  <td>{d.count} {d.countLabel}</td>
                  <td>{Object.entries(d.breakdown).map(([k, v]) => `${k}: ${fmtUsd(v)}`).join(", ")}</td>
                  <td>{d.willReplace && <strong>Will replace existing {preview.source} data for {d.date}</strong>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={handleConfirm} disabled={busy}>
            Confirm &amp; write to warehouse
          </button>
        </section>
      )}
    </div>
  );
}
