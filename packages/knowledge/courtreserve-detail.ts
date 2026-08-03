/**
 * CY360 Sales — CourtReserve live-API detail persistence (spec #1 v2, section 10).
 * Same Supabase/local-fallback dual-backend pattern as packages/knowledge/index.ts.
 * Every write upserts on the table's natural key (on_conflict) — a re-run of
 * `npm run backfill:courtreserve` over the same range replaces rows, never duplicates them.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoPath } from "../core/paths";
import type { SalesTransactionRow, CourtReservationRow, PaymentTypeTotalRow } from "../skills/courtreserve-ingest/index";

const LOCAL_DIR = repoPath(".local-storage", "warehouse");

function supabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

class SchemaNotMigratedError extends Error {}

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

function readLocalMap<T>(file: string, keyOf: (row: T) => string): Map<string, T> {
  const rows: T[] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  return new Map(rows.map(r => [keyOf(r), r]));
}

function writeLocalMap<T>(file: string, map: Map<string, T>): void {
  mkdirSync(LOCAL_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify([...map.values()], null, 2));
}

export async function writeSalesTransactions(rows: SalesTransactionRow[]): Promise<void> {
  if (rows.length === 0) return;
  if (supabaseConfigured()) {
    try {
      await supabaseRest("sales_transactions?on_conflict=location_slug,external_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows.map(r => ({
          location_slug: r.locationSlug, external_id: r.externalId, business_date: r.businessDate,
          occurred_at: r.occurredAt, category: r.category, item_name: r.itemName,
          gross_cents: r.grossCents, tax_cents: r.taxCents, net_cents: r.netCents,
          payment_type: r.paymentType, staff_name: r.staffName, raw: r.raw,
        }))),
      });
      return;
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
    }
  }
  const file = join(LOCAL_DIR, "sales_transactions.json");
  const map = readLocalMap<SalesTransactionRow>(file, r => `${r.locationSlug}:${r.externalId}`);
  for (const r of rows) map.set(`${r.locationSlug}:${r.externalId}`, r);
  writeLocalMap(file, map);
}

export async function writeCourtReservations(rows: CourtReservationRow[]): Promise<void> {
  if (rows.length === 0) return;
  if (supabaseConfigured()) {
    try {
      await supabaseRest("court_reservations?on_conflict=location_slug,reservation_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows.map(r => ({
          location_slug: r.locationSlug, reservation_id: r.reservationId,
          court_labels: r.courtLabels, court_ids: r.courtIds,
          start_at: r.startAt, end_at: r.endAt, business_date: r.businessDate,
        }))),
      });
      return;
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
    }
  }
  const file = join(LOCAL_DIR, "court_reservations.json");
  const map = readLocalMap<CourtReservationRow>(file, r => `${r.locationSlug}:${r.reservationId}`);
  for (const r of rows) map.set(`${r.locationSlug}:${r.reservationId}`, r);
  writeLocalMap(file, map);
}

export async function writePaymentTypeTotals(rows: PaymentTypeTotalRow[]): Promise<void> {
  if (rows.length === 0) return;
  if (supabaseConfigured()) {
    try {
      await supabaseRest("payment_type_totals?on_conflict=location_slug,date,payment_type", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows.map(r => ({
          location_slug: r.locationSlug, date: r.date, payment_type: r.paymentType,
          gross_cents: r.grossCents, transaction_count: r.transactionCount,
        }))),
      });
      return;
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
    }
  }
  const file = join(LOCAL_DIR, "payment_type_totals.json");
  const map = readLocalMap<PaymentTypeTotalRow>(file, r => `${r.locationSlug}:${r.date}:${r.paymentType}`);
  for (const r of rows) map.set(`${r.locationSlug}:${r.date}:${r.paymentType}`, r);
  writeLocalMap(file, map);
}
