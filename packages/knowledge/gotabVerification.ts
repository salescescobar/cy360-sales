/**
 * Storage for gotab_day_verifications (supabase/migrations/0006) — the per-day ledger
 * scripts/gotab-verify.ts writes as it re-checks every day against the live GoTab page.
 * Supabase when configured/migrated, local JSON fallback otherwise — same pattern as
 * packages/knowledge/index.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { repoPath } from "../core/paths";

export const GotabVerificationRow = z.object({
  locationSlug: z.string(),
  date: z.string(),
  storedCents: z.number().int().nullable(),
  observedCents: z.number().int().nullable(),
  observedBreakdown: z.record(z.number()).nullable().optional(),
  pageDateShown: z.string().nullable().optional(),
  status: z.enum(["ok", "corrected", "mismatch", "unreadable", "no_sales"]),
  note: z.string().nullable().optional(),
  checkedAt: z.string(),
});
export type GotabVerificationRow = z.infer<typeof GotabVerificationRow>;

const LOCAL_DIR = repoPath(".local-storage", "warehouse");
const LOCAL_FILE = join(LOCAL_DIR, "gotab_day_verifications.json");

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
    "⚠ Supabase is configured but gotab_day_verifications isn't migrated yet — apply " +
    "supabase/migrations/0006_gotab_day_verifications.sql. Falling back to local storage.",
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

function readLocalAll(): GotabVerificationRow[] {
  if (!existsSync(LOCAL_FILE)) return [];
  const raw = JSON.parse(readFileSync(LOCAL_FILE, "utf8"));
  if (!Array.isArray(raw)) return [];
  return raw.filter((r: unknown) => GotabVerificationRow.safeParse(r).success);
}

function writeLocalAll(rows: GotabVerificationRow[]): void {
  mkdirSync(LOCAL_DIR, { recursive: true });
  writeFileSync(LOCAL_FILE, JSON.stringify(rows, null, 2));
}

/** Upsert on (location_slug, date) — re-running a verification for the same day always
 *  overwrites its own row rather than accumulating history (idempotent by construction). */
export async function writeVerification(row: Omit<GotabVerificationRow, "checkedAt"> & { checkedAt?: string }): Promise<void> {
  const full: GotabVerificationRow = GotabVerificationRow.parse({ ...row, checkedAt: row.checkedAt ?? new Date().toISOString() });
  if (supabaseConfigured()) {
    try {
      await supabaseRest("gotab_day_verifications?on_conflict=location_slug,date", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          location_slug: full.locationSlug, date: full.date,
          stored_cents: full.storedCents, observed_cents: full.observedCents,
          observed_breakdown: full.observedBreakdown ?? null, page_date_shown: full.pageDateShown ?? null,
          status: full.status, note: full.note ?? null, checked_at: full.checkedAt,
        }),
      });
      return;
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
      warnSchemaNotMigrated();
    }
  }
  if (onVercel()) {
    throw new Error("gotabVerification.writeVerification: Supabase is not configured and Vercel has no writable disk for the local fallback.");
  }
  const rows = readLocalAll().filter(r => !(r.locationSlug === full.locationSlug && r.date === full.date));
  rows.push(full);
  writeLocalAll(rows);
}

export async function readVerification(locationSlug: string, date: string): Promise<GotabVerificationRow | null> {
  if (supabaseConfigured()) {
    try {
      const res = await supabaseRest(`gotab_day_verifications?location_slug=eq.${locationSlug}&date=eq.${date}`);
      const data = (await res.json()) as Array<Record<string, unknown>>;
      const d = data[0];
      if (!d) return null;
      return rowFromSupabase(d);
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
      warnSchemaNotMigrated();
    }
  }
  return readLocalAll().find(r => r.locationSlug === locationSlug && r.date === date) ?? null;
}

function rowFromSupabase(d: Record<string, unknown>): GotabVerificationRow {
  return GotabVerificationRow.parse({
    locationSlug: d.location_slug, date: d.date,
    storedCents: d.stored_cents, observedCents: d.observed_cents,
    observedBreakdown: d.observed_breakdown ?? null, pageDateShown: d.page_date_shown ?? null,
    status: d.status, note: d.note ?? null, checkedAt: d.checked_at,
  });
}

/** Every verification row for a location, most recent first — powers --only-suspect
 *  (re-check days whose last result wasn't clean) and the final summary report. */
export async function readVerifications(locationSlug: string): Promise<GotabVerificationRow[]> {
  if (supabaseConfigured()) {
    try {
      const res = await supabaseRest(`gotab_day_verifications?location_slug=eq.${locationSlug}&order=date.asc`);
      const data = (await res.json()) as Array<Record<string, unknown>>;
      return data.map(rowFromSupabase);
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
      warnSchemaNotMigrated();
    }
  }
  return readLocalAll().filter(r => r.locationSlug === locationSlug).sort((a, b) => a.date.localeCompare(b.date));
}

/** Dates needing another look: anything that wasn't a clean 'ok' or a confirmed 'no_sales'. */
export async function readSuspectDates(locationSlug: string): Promise<string[]> {
  const rows = await readVerifications(locationSlug);
  return rows.filter(r => r.status === "corrected" || r.status === "mismatch" || r.status === "unreadable").map(r => r.date);
}
