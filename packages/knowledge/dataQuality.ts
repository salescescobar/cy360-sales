/**
 * Storage for data_quality_flags (supabase/migrations/0007) — the guardrail ledger
 * packages/core/dataQuality.ts writes to and /admin/data-quality reads/resolves.
 * Supabase when configured/migrated, local JSON fallback otherwise — same pattern as
 * packages/knowledge/index.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { repoPath } from "../core/paths";

export const DataQualityFlagCode = z.enum(["outlier_day", "unverified_day", "month_unreliable"]);
export type DataQualityFlagCode = z.infer<typeof DataQualityFlagCode>;

export const DataQualityFlag = z.object({
  id: z.string(),
  locationSlug: z.string(),
  scope: z.enum(["day", "month"]),
  date: z.string().nullable().optional(),
  month: z.string().nullable().optional(),
  source: z.enum(["gotab", "courtreserve"]).nullable().optional(),
  code: DataQualityFlagCode,
  severity: z.enum(["warn", "error"]),
  message: z.string(),
  dedupeKey: z.string(),
  resolved: z.boolean(),
  resolvedBy: z.string().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type DataQualityFlag = z.infer<typeof DataQualityFlag>;

export type NewDataQualityFlag = {
  locationSlug: string;
  scope: "day" | "month";
  date?: string;
  month?: string;
  source?: "gotab" | "courtreserve";
  code: DataQualityFlagCode;
  severity: "warn" | "error";
  message: string;
};

export function dedupeKeyFor(f: NewDataQualityFlag): string {
  return `${f.locationSlug}:${f.scope}:${f.date ?? f.month ?? ""}:${f.code}:${f.source ?? "-"}`;
}

const LOCAL_DIR = repoPath(".local-storage", "warehouse");
const LOCAL_FILE = join(LOCAL_DIR, "data_quality_flags.json");

function supabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}
function onVercel(): boolean {
  return process.env.VERCEL === "1";
}
class SchemaNotMigratedError extends Error {}

let warned = false;
function warnSchemaNotMigrated(): void {
  if (warned) return;
  warned = true;
  console.error(
    "⚠ Supabase is configured but data_quality_flags isn't migrated yet — apply " +
    "supabase/migrations/0007_data_quality_flags.sql. Falling back to local storage.",
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

function readLocalAll(): DataQualityFlag[] {
  if (!existsSync(LOCAL_FILE)) return [];
  const raw = JSON.parse(readFileSync(LOCAL_FILE, "utf8"));
  if (!Array.isArray(raw)) return [];
  return raw.filter((r: unknown) => DataQualityFlag.safeParse(r).success);
}
function writeLocalAll(rows: DataQualityFlag[]): void {
  mkdirSync(LOCAL_DIR, { recursive: true });
  writeFileSync(LOCAL_FILE, JSON.stringify(rows, null, 2));
}

function rowFromSupabase(d: Record<string, unknown>): DataQualityFlag {
  return DataQualityFlag.parse({
    id: String(d.id), locationSlug: d.location_slug, scope: d.scope, date: d.date ?? null, month: d.month ?? null,
    source: d.source ?? null, code: d.code, severity: d.severity, message: d.message, dedupeKey: d.dedupe_key,
    resolved: d.resolved, resolvedBy: d.resolved_by ?? null, resolvedAt: d.resolved_at ?? null, createdAt: d.created_at,
  });
}

/**
 * Idempotent by dedupe_key: creates the flag if it has never been raised before, otherwise
 * leaves the existing row untouched — including one an admin already resolved. An automated
 * check must never silently re-open a resolution a human already made (criterion: resolve
 * writes resolved=true with who/when, and it sticks).
 */
export async function upsertFlag(f: NewDataQualityFlag): Promise<void> {
  const dedupeKey = dedupeKeyFor(f);
  if (supabaseConfigured()) {
    try {
      const existing = await supabaseRest(`data_quality_flags?dedupe_key=eq.${encodeURIComponent(dedupeKey)}&select=id`);
      if (((await existing.json()) as unknown[]).length > 0) return;
      await supabaseRest("data_quality_flags", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          location_slug: f.locationSlug, scope: f.scope, date: f.date ?? null, month: f.month ?? null,
          source: f.source ?? null, code: f.code, severity: f.severity, message: f.message, dedupe_key: dedupeKey,
        }),
      });
      return;
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
      warnSchemaNotMigrated();
    }
  }
  if (onVercel()) {
    throw new Error("dataQuality.upsertFlag: Supabase is not configured and Vercel has no writable disk for the local fallback.");
  }
  const rows = readLocalAll();
  if (rows.some(r => r.dedupeKey === dedupeKey)) return;
  rows.push({
    id: dedupeKey, locationSlug: f.locationSlug, scope: f.scope, date: f.date ?? null, month: f.month ?? null,
    source: f.source ?? null, code: f.code, severity: f.severity, message: f.message, dedupeKey,
    resolved: false, resolvedBy: null, resolvedAt: null, createdAt: new Date().toISOString(),
  });
  writeLocalAll(rows);
}

export async function listFlags(opts: { locationSlug?: string; resolved?: boolean } = {}): Promise<DataQualityFlag[]> {
  if (supabaseConfigured()) {
    try {
      const filters = [
        opts.locationSlug ? `location_slug=eq.${opts.locationSlug}` : null,
        opts.resolved != null ? `resolved=is.${opts.resolved}` : null,
      ].filter(Boolean).join("&");
      const res = await supabaseRest(`data_quality_flags${filters ? `?${filters}&order=created_at.desc` : "?order=created_at.desc"}`);
      const data = (await res.json()) as Array<Record<string, unknown>>;
      return data.map(rowFromSupabase);
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
      warnSchemaNotMigrated();
    }
  }
  let rows = readLocalAll();
  if (opts.locationSlug) rows = rows.filter(r => r.locationSlug === opts.locationSlug);
  if (opts.resolved != null) rows = rows.filter(r => r.resolved === opts.resolved);
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Resolve action (spec: "writes resolved=true with who and when"). Never un-resolves — the
 *  only writer of resolved=false is upsertFlag creating a brand-new row. */
export async function resolveFlag(id: string, resolvedBy: string): Promise<void> {
  const resolvedAt = new Date().toISOString();
  if (supabaseConfigured()) {
    try {
      await supabaseRest(`data_quality_flags?id=eq.${id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ resolved: true, resolved_by: resolvedBy, resolved_at: resolvedAt }),
      });
      return;
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
      warnSchemaNotMigrated();
    }
  }
  const rows = readLocalAll();
  const row = rows.find(r => r.id === id);
  if (!row) throw new Error(`dataQuality.resolveFlag: no flag with id ${id}`);
  row.resolved = true; row.resolvedBy = resolvedBy; row.resolvedAt = resolvedAt;
  writeLocalAll(rows);
}
