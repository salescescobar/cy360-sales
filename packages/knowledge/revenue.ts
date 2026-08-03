/**
 * A · Knowledge Agent — persistence for the v5 recognized-revenue model: revenue_recognized
 * (supabase/migrations/0005_recognized_revenue.sql), business_line_map, and the alerts_sent
 * dedupe ledger. Same Supabase-when-configured / local-JSON-fallback pattern as
 * packages/knowledge/index.ts and courtreserve.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoPath } from "../core/paths";
import type { RecognizedRevenueRow } from "../skills/courtreserve-ingest/index";
import { DEFAULT_BUSINESS_LINE_RULES, type BusinessLineRule } from "../skills/business-lines/index";

const LOCAL_DIR = repoPath(".local-storage", "warehouse");

function supabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

function onVercel(): boolean {
  return process.env.VERCEL === "1";
}

function requireLocalFallbackAllowed(op: string): void {
  if (onVercel()) {
    throw new Error(
      `knowledge.revenue.${op}: Supabase is not configured/migrated and Vercel has no writable disk for the ` +
      "local fallback — set SUPABASE_URL/SUPABASE_SERVICE_KEY and apply supabase/migrations/0005_recognized_revenue.sql.",
    );
  }
}

class SchemaNotMigratedError extends Error {}

let warnedSchemaNotMigrated = false;
function warnSchemaNotMigrated(): void {
  if (warnedSchemaNotMigrated) return;
  warnedSchemaNotMigrated = true;
  console.error(
    "⚠ Supabase is configured but the recognized-revenue schema isn't migrated yet — apply " +
    "supabase/migrations/0005_recognized_revenue.sql. Falling back to local storage until then.",
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

function localFile(name: string): string {
  return join(LOCAL_DIR, name);
}
function readLocalArray<T>(path: string): T[] {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
}
function writeLocalArray<T>(path: string, rows: T[]): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(rows, null, 2));
}

// ── revenue_recognized ──

function revenuePath(locationSlug: string): string {
  return localFile(join(locationSlug, "revenue_recognized.json"));
}

/** The live table's unique constraint (verified live 2026-08-02, "rev_rec_natural_key") is
 *  (location_slug, source, period_month, group_name, item_name, business_date) — one row per
 *  item per day, not per transaction, so two same-day transactions for the same category/item
 *  (e.g. two guests both booking "Drop-In Play") must be summed into a single row before
 *  insert rather than violating the constraint as separate rows. */
function aggregateForNaturalKey(rows: RecognizedRevenueRow[]): RecognizedRevenueRow[] {
  const byKey = new Map<string, RecognizedRevenueRow>();
  for (const r of rows) {
    const key = `${r.locationSlug}::${r.source}::${r.periodMonth}::${r.groupName}::${r.itemName}::${r.businessDate}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.amountCents += r.amountCents;
      existing.taxCents += r.taxCents;
      existing.netCents += r.netCents;
    } else {
      byKey.set(key, { ...r });
    }
  }
  return [...byKey.values()];
}

/** Replace every revenue_recognized row for this location in [fromDate, toDate] — same
 *  delete-then-insert idempotency as replaceCourtReserveDetail. */
export async function replaceRecognizedRevenue(
  locationSlug: string,
  fromDate: string,
  toDate: string,
  rows: RecognizedRevenueRow[],
): Promise<void> {
  if (supabaseConfigured()) {
    try {
      await supabaseRest(`revenue_recognized?location_slug=eq.${locationSlug}&business_date=gte.${fromDate}&business_date=lte.${toDate}`, { method: "DELETE" });
      const aggregated = aggregateForNaturalKey(rows);
      if (aggregated.length) {
        // The live table (verified live 2026-08-02) has no external_id/transaction_type/
        // payment_type columns — narrower than the migration file describes. external_id
        // isn't needed (replace is a delete-by-date-range, not an upsert-by-key); transaction
        // type/payment type still travel inside `raw` (the untouched source row) and are
        // reconstructed from there on read instead of a dedicated column.
        await supabaseRest("revenue_recognized", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(aggregated.map(r => ({
            location_slug: r.locationSlug, source: r.source,
            // period_month is a `date` column on the live table (not text, as the migration
            // file has it) — needs a full YYYY-MM-DD, so the first of the month.
            period_month: `${r.periodMonth}-01`, business_date: r.businessDate, group_name: r.groupName,
            item_name: r.itemName, amount_cents: r.amountCents, tax_cents: r.taxCents, net_cents: r.netCents,
            recognized_on: r.recognizedOn, raw: r.raw,
          }))),
        });
      }
      return;
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
      warnSchemaNotMigrated();
    }
  }
  requireLocalFallbackAllowed("replaceRecognizedRevenue");
  const path = revenuePath(locationSlug);
  const inRange = (d: string) => d >= fromDate && d <= toDate;
  const kept = readLocalArray<RecognizedRevenueRow>(path).filter(r => !inRange(r.businessDate));
  writeLocalArray(path, [...kept, ...rows]);
}

export async function readRecognizedRevenue(locationSlug: string, fromDate: string, toDate: string): Promise<RecognizedRevenueRow[]> {
  if (supabaseConfigured()) {
    try {
      const res = await supabaseRest(`revenue_recognized?location_slug=eq.${locationSlug}&business_date=gte.${fromDate}&business_date=lte.${toDate}&order=business_date.asc`);
      const data = (await res.json()) as Array<Record<string, unknown>>;
      return data.map(d => {
        const raw = (d.raw as Record<string, unknown>) ?? {};
        return {
          locationSlug: d.location_slug as string, source: "courtreserve" as const, externalId: "",
          businessDate: d.business_date as string, periodMonth: (d.period_month as string).slice(0, 7), groupName: d.group_name as string,
          itemName: d.item_name as string, amountCents: d.amount_cents as number, taxCents: d.tax_cents as number,
          netCents: d.net_cents as number, transactionType: (raw.TransactionType as string | null) ?? null,
          paymentType: (raw.PaymentType as string | null) ?? null, feeId: null, paymentId: null, relationId: null,
          recognizedOn: (d.recognized_on as string | null) ?? null, raw,
        };
      });
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
      warnSchemaNotMigrated();
    }
  }
  const rows = readLocalArray<RecognizedRevenueRow>(revenuePath(locationSlug));
  return rows.filter(r => r.businessDate >= fromDate && r.businessDate <= toDate);
}

// ── business_line_map ──

const RULES_PATH = localFile("business_line_map.json");

/** Local fallback seeds itself from DEFAULT_BUSINESS_LINE_RULES on first read, exactly like
 *  the Supabase migration's seed insert — never overwritten once any rule exists. */
function seededLocalRules(): BusinessLineRule[] {
  if (existsSync(RULES_PATH)) return readLocalArray<BusinessLineRule>(RULES_PATH);
  writeLocalArray(RULES_PATH, DEFAULT_BUSINESS_LINE_RULES);
  return DEFAULT_BUSINESS_LINE_RULES;
}

export async function listBusinessLineRules(): Promise<BusinessLineRule[]> {
  if (supabaseConfigured()) {
    try {
      const res = await supabaseRest("business_line_map?order=priority.asc");
      const data = (await res.json()) as Array<Record<string, unknown>>;
      if (data.length > 0) {
        return data.map(d => ({
          source: d.source as "gotab" | "courtreserve", matchGroup: (d.match_group as string | null) ?? null,
          matchItem: (d.match_item as string | null) ?? null, businessLine: d.business_line as BusinessLineRule["businessLine"],
          priority: d.priority as number,
        }));
      }
      // Supabase is migrated but empty (the seed insert hasn't run against this project yet) —
      // fall through to the same default set the migration seeds, never an empty resolver.
      return DEFAULT_BUSINESS_LINE_RULES;
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
      warnSchemaNotMigrated();
    }
  }
  return seededLocalRules();
}

/** Admin-only write (criterion #4: "let an admin assign it to a business line, writing
 *  business_line_map"). Appends a new rule rather than mutating an existing one, so the
 *  prior mapping (and whatever it already booked) is never silently rewritten. */
export async function addBusinessLineRule(rule: BusinessLineRule): Promise<void> {
  if (supabaseConfigured()) {
    try {
      await supabaseRest("business_line_map", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          source: rule.source, match_group: rule.matchGroup, match_item: rule.matchItem,
          business_line: rule.businessLine, priority: rule.priority,
        }),
      });
      return;
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
      warnSchemaNotMigrated();
    }
  }
  requireLocalFallbackAllowed("addBusinessLineRule");
  const existing = seededLocalRules();
  writeLocalArray(RULES_PATH, [...existing, rule]);
}

// ── alerts_sent (criterion #5: at most once per day per line) ──

const ALERTS_PATH = localFile("alerts_sent.json");

export type AlertRecord = { locationSlug: string; businessLine: string; sentOn: string; direction: "up" | "down"; comparison: string; pct: number; message: string };

/** Records the alert and returns true if this is the first one for (location, line, day) —
 *  false means it was already sent today and the caller must not push to Slack again. Uses
 *  the unique (location_slug, business_line, sent_on) constraint as the actual dedupe guard
 *  in Supabase (a race between two refresh runs can't double-send); the local fallback checks
 *  before writing since it has no such constraint to lean on. */
export async function tryRecordAlert(rec: AlertRecord): Promise<boolean> {
  if (supabaseConfigured()) {
    try {
      await supabaseRest("alerts_sent", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          location_slug: rec.locationSlug, business_line: rec.businessLine, sent_on: rec.sentOn,
          direction: rec.direction, comparison: rec.comparison, pct: rec.pct, message: rec.message,
        }),
      });
      return true;
    } catch (e) {
      if (e instanceof SchemaNotMigratedError) { warnSchemaNotMigrated(); }
      else if (String((e as Error).message).includes("23505")) return false; // unique_violation — already sent today
      else throw e;
    }
  }
  requireLocalFallbackAllowed("tryRecordAlert");
  const existing = readLocalArray<AlertRecord>(ALERTS_PATH);
  if (existing.some(a => a.locationSlug === rec.locationSlug && a.businessLine === rec.businessLine && a.sentOn === rec.sentOn)) return false;
  writeLocalArray(ALERTS_PATH, [...existing, rec]);
  return true;
}

/** Read-only history behind the admin Alerts view — the only observable evidence (short of a
 *  live Slack channel) that criterion #5's "pushed to Slack at most once per day per line"
 *  path actually fires, since notifySlack() itself is fire-and-forget with no return value. */
export async function listRecentAlerts(limit = 50): Promise<AlertRecord[]> {
  if (supabaseConfigured()) {
    try {
      const res = await supabaseRest(`alerts_sent?order=sent_on.desc,created_at.desc&limit=${limit}`);
      const data = (await res.json()) as Array<Record<string, unknown>>;
      return data.map(d => ({
        locationSlug: d.location_slug as string, businessLine: d.business_line as string, sentOn: d.sent_on as string,
        direction: d.direction as "up" | "down", comparison: d.comparison as string, pct: d.pct as number, message: d.message as string,
      }));
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
      warnSchemaNotMigrated();
    }
  }
  const existing = readLocalArray<AlertRecord>(ALERTS_PATH);
  return existing.sort((a, b) => (a.sentOn < b.sentOn ? 1 : -1)).slice(0, limit);
}
