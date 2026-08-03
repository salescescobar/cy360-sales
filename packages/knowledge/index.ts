/**
 * A · Knowledge Agent — the normalized Supabase sales warehouse for CY360.
 * Supabase (PostgREST) when SUPABASE_URL/SUPABASE_SERVICE_KEY are set AND the schema
 * (supabase/migrations/0001_init.sql) is migrated; local JSON fallback otherwise, so the
 * whole pipeline runs with zero accounts (and self-heals once the migration lands) —
 * mirrors the pattern in packages/core/storage.ts. Row-level isolation between locations
 * lives in Supabase RLS, never only in the UI (invariant #1).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { repoPath } from "../core/paths";

export const DailySalesRow = z.object({
  locationSlug: z.string(),
  date: z.string(),
  source: z.enum(["gotab", "courtreserve"]),
  grossAmountCents: z.number().int(),
  breakdown: z.record(z.number()),
});
export type DailySalesRow = z.infer<typeof DailySalesRow>;

export type RefreshStatus = "loaded" | "missing" | "error";
export type RefreshTrace = {
  locationSlug: string;
  date: string;
  at: string; // ISO timestamp — every run leaves this row, success or failure (invariant #4)
  gotabStatus: RefreshStatus;
  courtreserveStatus: RefreshStatus;
  status: "complete" | "incomplete";
  error?: string;
};

const LOCAL_DIR = repoPath(".local-storage", "warehouse");
const TRACE_FILE = join(LOCAL_DIR, "refresh_runs.jsonl");

function supabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

/** Vercel sets this in every deployment (production, preview, `vercel dev`). Serverless
 *  functions there have no writable disk, so the .local-storage fallback must never be
 *  attempted there — Supabase is the only warehouse in production. */
function onVercel(): boolean {
  return process.env.VERCEL === "1";
}

function requireLocalFallbackAllowed(op: string): void {
  if (onVercel()) {
    throw new Error(
      `knowledge.${op}: Supabase is not configured/migrated and Vercel has no writable disk for the ` +
      "local fallback — set SUPABASE_URL/SUPABASE_SERVICE_KEY and apply supabase/migrations/0001_init.sql.",
    );
  }
}

/** Thrown when Supabase is configured but the warehouse tables don't exist yet — distinct
 *  from a real outage/auth error, and the only case that falls back to local storage. */
class SchemaNotMigratedError extends Error {}

let warnedSchemaNotMigrated = false;
function warnSchemaNotMigrated(): void {
  if (warnedSchemaNotMigrated) return;
  warnedSchemaNotMigrated = true;
  console.error(
    "⚠ Supabase is configured but the warehouse schema isn't migrated yet — apply " +
    "supabase/migrations/0001_init.sql. Falling back to local storage until then.",
  );
}

async function supabaseRest(path: string, init: RequestInit = {}): Promise<Response> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 404 && body.includes("PGRST205")) throw new SchemaNotMigratedError(`table not found for ${path}`);
    throw new Error(`Supabase REST ${path} failed: ${res.status} ${body}`);
  }
  return res;
}

function localDayPath(locationSlug: string, date: string): string {
  return join(LOCAL_DIR, locationSlug, `${date}.json`);
}

/** Reads whatever normalized rows are on disk for a day, dropping anything that doesn't
 *  match the DailySalesRow shape rather than letting a corrupted file leak through. */
function localDayRows(locationSlug: string, date: string): DailySalesRow[] {
  const path = localDayPath(locationSlug, date);
  if (!existsSync(path)) return [];
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) return [];
  return raw.filter((r: unknown) => DailySalesRow.safeParse(r).success);
}

let warnedInvalidRow = false;

/** A row that fails DailySalesRow validation (e.g. a non-numeric value in `breakdown`,
 *  the shape a direct/manual write to the warehouse produces instead of going through
 *  writeDay) is dropped rather than surfaced — treated as if that source never loaded,
 *  never as fabricated revenue. Prevents a poisoned field from becoming a displayed $NaN
 *  or a string-concatenated month total (aggregateDaily/aggregateMonthly trust this row
 *  shape completely). */
function warnInvalidRow(locationSlug: string, date: string, source: unknown): void {
  if (warnedInvalidRow) return;
  warnedInvalidRow = true;
  console.error(
    `⚠ knowledge: dropped an invalid daily_sales row for ${locationSlug}/${date} (source=${String(source)}) — ` +
    "breakdown must be Record<string, number>. This row didn't come from writeDay/the confirmed " +
    "import path and is being treated as not-loaded rather than trusted.",
  );
}

/** Merges two row sets by source, `override` winning when both have the same source —
 *  used to let Supabase take priority per-source while local disk fills in any source
 *  Supabase doesn't have (or just dropped for failing validation). */
function mergeRowsBySource(base: DailySalesRow[], override: DailySalesRow[]): DailySalesRow[] {
  const bySource = new Map(base.map(r => [r.source, r]));
  for (const r of override) bySource.set(r.source, r);
  return [...bySource.values()];
}

/** Upsert a day's normalized rows (one or both sources present). Merges with whatever already loaded that day. */
export async function writeDay(locationSlug: string, date: string, rows: DailySalesRow[]): Promise<void> {
  for (const r of rows) DailySalesRow.parse(r);
  if (supabaseConfigured()) {
    try {
      // on_conflict is required: without it PostgREST's merge-duplicates targets the table's
      // primary key (id, an identity column never sent in this payload), so a same-day
      // re-upload would hit a raw unique_violation on (location_slug, date, source) instead
      // of upserting — criterion #6 (replace, never duplicate) depends on this.
      await supabaseRest("daily_sales?on_conflict=location_slug,date,source", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows.map(r => ({
          location_slug: r.locationSlug, date: r.date, source: r.source,
          gross_amount_cents: r.grossAmountCents, breakdown: r.breakdown,
        }))),
      });
      return;
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
      warnSchemaNotMigrated();
    }
  }
  requireLocalFallbackAllowed("writeDay");
  mkdirSync(join(LOCAL_DIR, locationSlug), { recursive: true });
  const path = localDayPath(locationSlug, date);
  const existing: DailySalesRow[] = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
  const bySource = new Map(existing.map(r => [r.source, r]));
  for (const r of rows) bySource.set(r.source, r);
  writeFileSync(path, JSON.stringify([...bySource.values()], null, 2));
}

export async function readDay(locationSlug: string, date: string): Promise<DailySalesRow[]> {
  const local = localDayRows(locationSlug, date);
  if (supabaseConfigured()) {
    try {
      const res = await supabaseRest(`daily_sales?location_slug=eq.${locationSlug}&date=eq.${date}`);
      const data = (await res.json()) as Array<Record<string, unknown>>;
      const valid: DailySalesRow[] = [];
      for (const d of data) {
        const parsed = DailySalesRow.safeParse({
          locationSlug: d.location_slug, date: d.date, source: d.source,
          grossAmountCents: d.gross_amount_cents, breakdown: d.breakdown,
        });
        if (parsed.success) valid.push(parsed.data);
        else warnInvalidRow(locationSlug, date, d.source);
      }
      // Supabase wins per-source when valid; local disk fills in anything Supabase
      // doesn't have (never configured yet, or a row that just failed validation above).
      return mergeRowsBySource(local, valid);
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
      warnSchemaNotMigrated();
    }
  }
  return local;
}

/** All days loaded for a location in a given month (YYYY-MM), oldest first. */
function localMonthRows(locationSlug: string, month: string): Map<string, DailySalesRow[]> {
  const result = new Map<string, DailySalesRow[]>();
  const dir = join(LOCAL_DIR, locationSlug);
  if (!existsSync(dir)) return result;
  for (const file of readdirSync(dir).sort()) {
    if (!file.startsWith(month) || !file.endsWith(".json")) continue;
    const date = file.replace(".json", "");
    result.set(date, localDayRows(locationSlug, date));
  }
  return result;
}

export async function readMonth(locationSlug: string, month: string): Promise<Map<string, DailySalesRow[]>> {
  const result = localMonthRows(locationSlug, month);
  if (supabaseConfigured()) {
    try {
      const res = await supabaseRest(`daily_sales?location_slug=eq.${locationSlug}&date=gte.${month}-01&date=lt.${nextMonth(month)}-01&order=date.asc`);
      const data = (await res.json()) as Array<Record<string, unknown>>;
      for (const d of data) {
        const parsed = DailySalesRow.safeParse({
          locationSlug: d.location_slug, date: d.date, source: d.source,
          grossAmountCents: d.gross_amount_cents, breakdown: d.breakdown,
        });
        if (!parsed.success) { warnInvalidRow(locationSlug, d.date as string, d.source); continue; }
        // Supabase wins per-source when valid; local disk (seeded above) fills any gap.
        result.set(parsed.data.date, mergeRowsBySource(result.get(parsed.data.date) ?? [], [parsed.data]));
      }
      return result;
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
      warnSchemaNotMigrated();
    }
  }
  return result;
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1)); // m is already next month (0-indexed) since input m is 1-indexed
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Every refresh attempt writes one trace row — complete, incomplete, or errored. Never skipped (invariant #4). */
export async function traceRefresh(trace: RefreshTrace): Promise<void> {
  if (supabaseConfigured()) {
    try {
      await supabaseRest("refresh_runs", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          location_slug: trace.locationSlug, date: trace.date, at: trace.at,
          gotab_status: trace.gotabStatus, courtreserve_status: trace.courtreserveStatus,
          status: trace.status, error: trace.error ?? null,
        }),
      });
      return;
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
      warnSchemaNotMigrated();
    }
  }
  requireLocalFallbackAllowed("traceRefresh");
  mkdirSync(LOCAL_DIR, { recursive: true });
  appendFileSync(TRACE_FILE, JSON.stringify(trace) + "\n");
}

export async function readTraces(locationSlug?: string): Promise<RefreshTrace[]> {
  if (supabaseConfigured()) {
    try {
      const filter = locationSlug ? `?location_slug=eq.${locationSlug}&order=at.desc` : "?order=at.desc";
      const res = await supabaseRest(`refresh_runs${filter}`);
      const data = (await res.json()) as Array<Record<string, unknown>>;
      return data.map(d => ({
        locationSlug: d.location_slug as string, date: d.date as string, at: d.at as string,
        gotabStatus: d.gotab_status as RefreshStatus, courtreserveStatus: d.courtreserve_status as RefreshStatus,
        status: d.status as "complete" | "incomplete", error: (d.error as string | null) ?? undefined,
      }));
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
      warnSchemaNotMigrated();
    }
  }
  if (!existsSync(TRACE_FILE)) return [];
  const traces = readFileSync(TRACE_FILE, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l) as RefreshTrace);
  return locationSlug ? traces.filter(t => t.locationSlug === locationSlug) : traces;
}

/**
 * Recompute a day's complete/incomplete status from whatever is actually in the warehouse
 * and write the trace row (criterion #2: "write one trace row per (location, date)
 * recording which sources are present"; invariant #4: never accept an upload without one).
 * Called after a confirmed import writes its rows — reads back both sources so a GoTab
 * upload doesn't overwrite the trace as if CourtReserve had also just gone missing.
 */
export async function traceImportedDay(locationSlug: string, date: string): Promise<RefreshTrace> {
  const rows = await readDay(locationSlug, date);
  const gotabStatus: RefreshStatus = rows.some(r => r.source === "gotab") ? "loaded" : "missing";
  const courtreserveStatus: RefreshStatus = rows.some(r => r.source === "courtreserve") ? "loaded" : "missing";
  const status: "complete" | "incomplete" = gotabStatus === "loaded" && courtreserveStatus === "loaded" ? "complete" : "incomplete";
  const trace: RefreshTrace = { locationSlug, date, at: new Date().toISOString(), gotabStatus, courtreserveStatus, status };
  await traceRefresh(trace);
  return trace;
}

export type ImportUploadRecord = {
  locationSlug: string;
  source: "gotab" | "courtreserve";
  date: string;
  storagePath: string;
  originalFilename: string;
  uploadedBy?: string;
};

const IMPORTS_TRACE_FILE = join(LOCAL_DIR, "import_uploads.jsonl");

/** Raw-file audit trail row (criterion #2's other half — the trace row is traceImportedDay
 *  above; this is the pointer to the raw copy in Supabase Storage bucket `imports`). */
export async function recordImportUpload(rec: ImportUploadRecord): Promise<void> {
  if (supabaseConfigured()) {
    try {
      await supabaseRest("import_uploads", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          location_slug: rec.locationSlug, source: rec.source, date: rec.date,
          storage_path: rec.storagePath, original_filename: rec.originalFilename,
          uploaded_by: rec.uploadedBy ?? null,
        }),
      });
      return;
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
      warnSchemaNotMigrated();
    }
  }
  requireLocalFallbackAllowed("recordImportUpload");
  mkdirSync(LOCAL_DIR, { recursive: true });
  appendFileSync(IMPORTS_TRACE_FILE, JSON.stringify({ ...rec, uploadedAt: new Date().toISOString() }) + "\n");
}
