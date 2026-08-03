/**
 * A · Knowledge Agent — persistence for the CourtReserve API detail tables (spec #1
 * section 10): sales_transactions, court_reservations, payment_type_totals. Same
 * Supabase-when-configured / local-JSON-fallback pattern as packages/knowledge/index.ts.
 *
 * Idempotent by construction: a replace always deletes whatever previously loaded for the
 * (location, date-range) before inserting the fresh rows, so a re-run of the daily refresh
 * or `npm run backfill:courtreserve` replaces rather than duplicates — never a raw INSERT.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoPath } from "../core/paths";
import type { SalesTransactionRow, CourtReservationRow, PaymentTypeTotalRow } from "../skills/courtreserve-ingest/index";

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
      `knowledge.courtreserve.${op}: Supabase is not configured/migrated and Vercel has no writable disk for the ` +
      "local fallback — set SUPABASE_URL/SUPABASE_SERVICE_KEY and apply supabase/migrations/0004_courtreserve_transactions.sql.",
    );
  }
}

class SchemaNotMigratedError extends Error {}

let warnedSchemaNotMigrated = false;
function warnSchemaNotMigrated(): void {
  if (warnedSchemaNotMigrated) return;
  warnedSchemaNotMigrated = true;
  console.error(
    "⚠ Supabase is configured but the CourtReserve detail schema isn't migrated yet — apply " +
    "supabase/migrations/0004_courtreserve_transactions.sql. Falling back to local storage until then.",
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

function localFile(locationSlug: string, name: string): string {
  return join(LOCAL_DIR, locationSlug, `courtreserve_${name}.json`);
}

function readLocalArray<T>(path: string): T[] {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
}

function writeLocalArray<T>(path: string, rows: T[]): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(rows, null, 2));
}

/**
 * Replace every sales_transactions/court_reservations/payment_type_totals row for this
 * location in [fromDate, toDate] (inclusive) with the freshly-mapped rows. Called once per
 * fetch — the daily refresh passes a single-day range, `backfill:courtreserve` a month.
 */
export async function replaceCourtReserveDetail(
  locationSlug: string,
  fromDate: string,
  toDate: string,
  detail: { transactions: SalesTransactionRow[]; reservations: CourtReservationRow[]; paymentTypeTotals: PaymentTypeTotalRow[] },
): Promise<void> {
  if (supabaseConfigured()) {
    try {
      await supabaseRest(`sales_transactions?location_slug=eq.${locationSlug}&business_date=gte.${fromDate}&business_date=lte.${toDate}`, { method: "DELETE" });
      await supabaseRest(`court_reservations?location_slug=eq.${locationSlug}&business_date=gte.${fromDate}&business_date=lte.${toDate}`, { method: "DELETE" });
      // Remote schema (verified live) names these columns business_date/amount_cents/tx_count
      // with a source column, not the date/gross_cents/transaction_count of the original
      // migration file — the live table already holds real production totals under those
      // names, so the code maps to it rather than risk altering a populated production table.
      await supabaseRest(`payment_type_totals?location_slug=eq.${locationSlug}&business_date=gte.${fromDate}&business_date=lte.${toDate}`, { method: "DELETE" });

      if (detail.transactions.length) {
        await supabaseRest("sales_transactions", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(detail.transactions.map(t => ({
            location_slug: t.locationSlug, source: t.source, external_id: t.externalId, business_date: t.businessDate,
            occurred_at: t.occurredAt, category: t.category, item_name: t.itemName, quantity: t.quantity,
            gross_cents: t.grossCents, discount_cents: t.discountCents, comp_cents: t.compCents,
            tax_cents: t.taxCents, tip_cents: t.tipCents, net_cents: t.netCents,
            payment_type: t.paymentType, channel: t.channel, staff_name: t.staffName, raw: t.raw,
          }))),
        });
      }
      if (detail.reservations.length) {
        await supabaseRest("court_reservations", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(detail.reservations.map(r => ({
            location_slug: r.locationSlug, reservation_id: r.reservationId, court_name: r.courtName,
            court_type: r.courtType, starts_at: r.startsAt, ends_at: r.endsAt, duration_minutes: r.durationMinutes,
            players_count: r.playersCount, amount_cents: r.amountCents, status: r.status,
            business_date: r.businessDate, raw: r.raw,
          }))),
        });
      }
      if (detail.paymentTypeTotals.length) {
        await supabaseRest("payment_type_totals", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(detail.paymentTypeTotals.map(p => ({
            location_slug: p.locationSlug, source: "courtreserve", business_date: p.date, payment_type: p.paymentType,
            amount_cents: p.grossCents, tx_count: p.transactionCount,
          }))),
        });
      }
      return;
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
      warnSchemaNotMigrated();
    }
  }

  requireLocalFallbackAllowed("replaceCourtReserveDetail");
  const inRange = (date: string) => date >= fromDate && date <= toDate;

  const txPath = localFile(locationSlug, "transactions");
  const kept = readLocalArray<SalesTransactionRow>(txPath).filter(t => !inRange(t.businessDate));
  writeLocalArray(txPath, [...kept, ...detail.transactions]);

  const resPath = localFile(locationSlug, "reservations");
  const keptRes = readLocalArray<CourtReservationRow>(resPath).filter(r => !inRange(r.businessDate));
  writeLocalArray(resPath, [...keptRes, ...detail.reservations]);

  const totalsPath = localFile(locationSlug, "payment_totals");
  const keptTotals = readLocalArray<PaymentTypeTotalRow>(totalsPath).filter(p => !inRange(p.date));
  writeLocalArray(totalsPath, [...keptTotals, ...detail.paymentTypeTotals]);
}

export async function readCourtReserveTransactions(locationSlug: string, fromDate: string, toDate: string): Promise<SalesTransactionRow[]> {
  if (supabaseConfigured()) {
    try {
      const res = await supabaseRest(`sales_transactions?location_slug=eq.${locationSlug}&business_date=gte.${fromDate}&business_date=lte.${toDate}&order=business_date.asc`);
      const data = (await res.json()) as Array<Record<string, unknown>>;
      return data.map(d => ({
        locationSlug: d.location_slug as string, source: "courtreserve" as const, externalId: d.external_id as string, businessDate: d.business_date as string,
        occurredAt: d.occurred_at as string, category: d.category as string, itemName: d.item_name as string,
        quantity: (d.quantity as number | null) ?? null,
        grossCents: d.gross_cents as number, discountCents: (d.discount_cents as number) ?? 0, compCents: (d.comp_cents as number) ?? 0,
        taxCents: d.tax_cents as number, tipCents: (d.tip_cents as number) ?? 0, netCents: d.net_cents as number,
        paymentType: (d.payment_type as string | null) ?? null, channel: (d.channel as string | null) ?? null,
        staffName: (d.staff_name as string | null) ?? null,
        raw: (d.raw as Record<string, unknown>) ?? {},
      }));
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
      warnSchemaNotMigrated();
    }
  }
  const rows = readLocalArray<SalesTransactionRow>(localFile(locationSlug, "transactions"));
  return rows.filter(t => t.businessDate >= fromDate && t.businessDate <= toDate);
}
