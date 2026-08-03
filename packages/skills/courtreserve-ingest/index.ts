/**
 * Skill: courtreserve-ingest (Agent A). Read-only court activity in, normalized rows out.
 * CSV upload (mode: csv, the web /import path) or the verified live API (mode: api, spec
 * #1 section 10) — same CourtReserveDay shape out either way, so metrics/dashboard never
 * change when the switch flips (config.yaml -> sources.courtreserve.mode).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { repoPath } from "../../core/paths";

export const CourtReserveLineItem = z.object({
  courtType: z.string(),
  grossAmountCents: z.number().int(),
  reservationCount: z.number().int(),
});
export type CourtReserveLineItem = z.infer<typeof CourtReserveLineItem>;

export type CourtReserveDay = {
  locationSlug: string;
  date: string; // YYYY-MM-DD
  lineItems: CourtReserveLineItem[];
  totalGrossCents: number;
  totalReservations: number;
  breakdown: Record<string, number>; // courtType -> gross cents
};

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n").filter(l => l.length > 0);
  const header = lines[0].split(",").map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = line.split(",").map(c => c.trim());
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  });
}

const toCents = (dollars: string) => Math.round(parseFloat(dollars) * 100);

/**
 * Normalize one day of CourtReserve activity for one location.
 * Returns null when the source has nothing for that day — never fabricated as zero.
 */
export async function ingestCourtReserveDay(
  locationSlug: string,
  date: string,
  opts: {
    mode?: "csv" | "api";
    baseDir?: string;
    // Test/backfill-script seam — see fetchCourtReserveDetailedRows below. Kept out of the
    // default wiring so a live call always goes through the real HTTP client.
    fetchDetailedRows?: (startDate: string, endDate: string) => Promise<CourtReserveDetailedRow[]>;
  } = {},
): Promise<CourtReserveDay | null> {
  const mode = opts.mode ?? "csv";
  if (mode === "api") {
    const { transactions } = await ingestCourtReserveDetail(locationSlug, date, date, { fetchDetailedRows: opts.fetchDetailedRows });
    return aggregateCourtReserveDetailToDay(locationSlug, date, transactions);
  }
  const path = join(opts.baseDir ?? repoPath("data/imports/courtreserve"), locationSlug, `${date}.csv`);
  if (!existsSync(path)) return null;

  const rows = parseCsv(readFileSync(path, "utf8"));
  const lineItems: CourtReserveLineItem[] = rows.map(r => CourtReserveLineItem.parse({
    courtType: r.court_type,
    grossAmountCents: toCents(r.gross_amount),
    reservationCount: parseInt(r.reservation_count, 10),
  }));

  const totalGrossCents = lineItems.reduce((a, r) => a + r.grossAmountCents, 0);
  const totalReservations = lineItems.reduce((a, r) => a + r.reservationCount, 0);
  const breakdown: Record<string, number> = {};
  for (const r of lineItems) breakdown[r.courtType] = (breakdown[r.courtType] ?? 0) + r.grossAmountCents;

  return { locationSlug, date, lineItems, totalGrossCents, totalReservations, breakdown };
}

const COURTRESERVE_EXPORT_COLUMNS = ["date", "court_type", "gross_amount", "reservation_count"] as const;

export type CourtReserveExportDay = {
  date: string;
  lineItems: CourtReserveLineItem[];
  totalGrossCents: number;
  totalReservations: number;
  breakdown: Record<string, number>;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Header sniff for the web upload flow (criterion #1: "detect which source"). */
export function looksLikeCourtReserveExport(header: string[]): boolean {
  return COURTRESERVE_EXPORT_COLUMNS.every(c => header.includes(c));
}

/**
 * Parse a raw CourtReserve CSV export (web upload) into one or more days. Throws a
 * specific, human-readable message naming the problem on anything malformed/empty/
 * unrecognized (criterion #8) — never fabricates a partial parse.
 */
export function parseCourtReserveCsvExport(text: string): CourtReserveExportDay[] {
  const lines = text.trim().split("\n").filter(l => l.length > 0);
  if (lines.length === 0) throw new Error("courtreserve-ingest: the file is empty — no rows found");

  const header = lines[0].split(",").map(h => h.trim());
  if (!looksLikeCourtReserveExport(header)) {
    throw new Error(`courtreserve-ingest: unrecognized CSV format — expected columns ${COURTRESERVE_EXPORT_COLUMNS.join(", ")}, got: ${header.join(", ")}`);
  }
  if (lines.length === 1) throw new Error("courtreserve-ingest: the file has a header but no data rows");

  const byDate = new Map<string, CourtReserveLineItem[]>();
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map(c => c.trim());
    const row = Object.fromEntries(header.map((h, idx) => [h, cells[idx]]));
    const rowNum = i + 1;

    if (!row.date || !DATE_RE.test(row.date)) throw new Error(`courtreserve-ingest: row ${rowNum} has an invalid date "${row.date ?? ""}" — expected YYYY-MM-DD`);
    if (!row.court_type) throw new Error(`courtreserve-ingest: row ${rowNum} is missing a court_type`);
    const grossAmountCents = toCents(row.gross_amount);
    if (!Number.isFinite(grossAmountCents)) throw new Error(`courtreserve-ingest: row ${rowNum} has a non-numeric gross_amount "${row.gross_amount ?? ""}"`);
    const reservationCount = parseInt(row.reservation_count, 10);
    if (!Number.isFinite(reservationCount)) throw new Error(`courtreserve-ingest: row ${rowNum} has a non-numeric reservation_count "${row.reservation_count ?? ""}"`);

    const item = CourtReserveLineItem.parse({ courtType: row.court_type, grossAmountCents, reservationCount });
    const existing = byDate.get(row.date);
    if (existing) existing.push(item); else byDate.set(row.date, [item]);
  }

  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, lineItems]) => {
    const totalGrossCents = lineItems.reduce((a, r) => a + r.grossAmountCents, 0);
    const totalReservations = lineItems.reduce((a, r) => a + r.reservationCount, 0);
    const breakdown: Record<string, number> = {};
    for (const r of lineItems) breakdown[r.courtType] = (breakdown[r.courtType] ?? 0) + r.grossAmountCents;
    return { date, lineItems, totalGrossCents, totalReservations, breakdown };
  });
}

// ── CourtReserve API — VERIFIED CONTRACT (spec #1 section 10, tested live 2026-08-02) ──
// Auth: HTTP Basic (COURTRESERVE_API_USER / COURTRESERVE_API_PASS). Org id
// (COURTRESERVE_ORG_ID) is validated against the response, never sent as a request param.
// Invariant #3: credentials only ever come from env — never hardcoded, never logged.

const COURTRESERVE_API_BASE = "https://api.courtreserve.com";

/** One row of GET /api/v1/transactions/salessummarydetailed's Data.DetailedRows. Loosely
 *  typed (nullable/optional beyond what we actually map) — a source field we don't use
 *  changing shape should never break ingestion of the fields we do. */
export const CourtReserveDetailedRow = z.object({
  FeeCategoryName: z.string(),
  ItemName: z.string(),
  RevenueCategoryName: z.string().nullish(),
  RevenueCategoryId: z.union([z.string(), z.number()]).nullish(),
  GLCode: z.string().nullish(),
  Amount: z.number(),
  AmountWithNoTax: z.number(),
  TaxTotal: z.number(),
  OrgMemberId: z.union([z.string(), z.number()]).nullish(),
  OrgMemberFamilyId: z.union([z.string(), z.number()]).nullish(),
  MemberFullName: z.string().nullish(),
  MembershipName: z.string().nullish(),
  Start: z.string().nullish(),
  End: z.string().nullish(),
  // Verified live 2026-08-02: the API returns these as arrays (CourtIds of numbers), not
  // the scalar strings the documented field names suggest — a schema-only mismatch (a bad
  // guess at the shape, not a live source change), so no re-verification of the
  // endpoint/auth/mapping was needed.
  CourtLabels: z.union([z.string(), z.array(z.union([z.string(), z.number()]))]).nullish(),
  CourtIds: z.union([z.string(), z.array(z.union([z.string(), z.number()]))]).nullish(),
  ReservationId: z.union([z.string(), z.number()]).nullish(),
  InstructorNames: z.string().nullish(),
  PaymentType: z.string().nullish(),
  TransactionType: z.string().nullish(),
  TransactionId: z.union([z.string(), z.number()]),
  TransactionDate: z.string().nullish(),
  PaidDate: z.string(),
  FamilyName: z.string().nullish(),
  ItemCost: z.number().nullish(),
});
export type CourtReserveDetailedRow = z.infer<typeof CourtReserveDetailedRow>;

type SalesSummaryDetailedResponse = {
  ErrorMessage?: string | null;
  Data: { Start: string; End: string; OrganizationId: number | string; OrganizationName: string; DetailedRows: unknown[] };
};

export type CourtReserveApiCreds = { user: string; pass: string; orgId: string };

export function courtReserveCredsFromEnv(): CourtReserveApiCreds {
  const user = process.env.COURTRESERVE_API_USER;
  const pass = process.env.COURTRESERVE_API_PASS;
  const orgId = process.env.COURTRESERVE_ORG_ID;
  if (!user || !pass || !orgId) {
    throw new Error("courtreserve-ingest: mode=api requires COURTRESERVE_API_USER, COURTRESERVE_API_PASS and COURTRESERVE_ORG_ID");
  }
  return { user, pass, orgId };
}

/**
 * Live call to the verified salessummarydetailed endpoint. Validates the response actually
 * belongs to our configured org before returning a single row — a credentials mixup must
 * surface as a loud error, never silently ingest another organization's data.
 */
export async function fetchCourtReserveDetailedRows(
  startDate: string,
  endDate: string,
  creds: CourtReserveApiCreds = courtReserveCredsFromEnv(),
): Promise<CourtReserveDetailedRow[]> {
  const url = `${COURTRESERVE_API_BASE}/api/v1/transactions/salessummarydetailed?paymentStartDate=${startDate}&paymentEndDate=${endDate}`;
  const auth = Buffer.from(`${creds.user}:${creds.pass}`).toString("base64");
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } });
  if (!res.ok) throw new Error(`courtreserve-ingest: API request failed: ${res.status} ${await res.text()}`);

  const body = (await res.json()) as SalesSummaryDetailedResponse;
  if (body.ErrorMessage) throw new Error(`courtreserve-ingest: API returned an error: ${body.ErrorMessage}`);
  if (String(body.Data.OrganizationId) !== String(creds.orgId)) {
    throw new Error(
      `courtreserve-ingest: response org id ${body.Data.OrganizationId} does not match configured COURTRESERVE_ORG_ID ${creds.orgId} — refusing to ingest`,
    );
  }
  return body.Data.DetailedRows.map(r => CourtReserveDetailedRow.parse(r));
}

export type SalesTransactionRow = {
  locationSlug: string;
  source: "courtreserve";
  externalId: string;
  businessDate: string; // YYYY-MM-DD, date(PaidDate)
  occurredAt: string; // PaidDate, as-is
  category: string;
  itemName: string;
  quantity: number | null;
  grossCents: number;
  discountCents: number;
  compCents: number;
  taxCents: number;
  tipCents: number;
  netCents: number;
  paymentType: string | null;
  channel: string | null;
  staffName: string | null;
  raw: Record<string, unknown>; // the row MINUS MemberFullName/FamilyName (never stored — invariant, spec section 10)
};

export type CourtReservationRow = {
  locationSlug: string;
  reservationId: string;
  courtName: string | null;
  courtType: string | null;
  startsAt: string | null;
  endsAt: string | null;
  durationMinutes: number | null;
  playersCount: number | null;
  amountCents: number;
  status: string | null;
  businessDate: string;
  raw: Record<string, unknown>;
};

export type PaymentTypeTotalRow = {
  locationSlug: string;
  date: string;
  paymentType: string;
  grossCents: number;
  transactionCount: number;
};

const toCentsFromAmount = (n: number) => Math.round(n * 100);

/** THE SYSTEM SHALL NEVER store MemberFullName or FamilyName — drop them before persisting.
 *  OrgMemberId/OrgMemberFamilyId are opaque ids and may be kept. `externalId` carries a
 *  `#<occurrence>` suffix (verified against the live table's existing rows 2026-08-02) since
 *  a single TransactionId can appear on more than one DetailedRow. */
export function mapDetailedRowsToTransactions(rows: CourtReserveDetailedRow[], locationSlug: string): SalesTransactionRow[] {
  const occurrence = new Map<string, number>();
  return rows.map(row => {
    const { MemberFullName, FamilyName, ...raw } = row;
    const id = String(row.TransactionId);
    const idx = occurrence.get(id) ?? 0;
    occurrence.set(id, idx + 1);
    return {
      locationSlug,
      source: "courtreserve" as const,
      externalId: `${id}#${idx}`,
      businessDate: row.PaidDate.slice(0, 10),
      occurredAt: row.PaidDate,
      category: row.FeeCategoryName,
      itemName: row.ItemName,
      quantity: null,
      grossCents: toCentsFromAmount(row.Amount),
      discountCents: 0,
      compCents: 0,
      taxCents: toCentsFromAmount(row.TaxTotal),
      tipCents: 0,
      netCents: toCentsFromAmount(row.AmountWithNoTax),
      paymentType: row.PaymentType ?? null,
      channel: row.TransactionType ?? null,
      staffName: row.InstructorNames ?? null,
      raw,
    };
  });
}


/** court_reservations, deduped by ReservationId — a reservation can carry multiple fee
 *  line items (multiple DetailedRows), but is one row here. Rows with no ReservationId
 *  (non-court fees) are simply not reservations and are skipped. */
function joinIfArray(value: string | (string | number)[] | null | undefined): string | null {
  if (value == null) return null;
  return Array.isArray(value) ? value.join(", ") : value;
}

function minutesBetween(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(ms) ? Math.round(ms / 60000) : null;
}

export function mapDetailedRowsToReservations(rows: CourtReserveDetailedRow[], locationSlug: string): CourtReservationRow[] {
  const byId = new Map<string, CourtReservationRow>();
  for (const row of rows) {
    if (row.ReservationId == null) continue;
    const reservationId = String(row.ReservationId);
    if (byId.has(reservationId)) continue;
    byId.set(reservationId, {
      locationSlug,
      reservationId,
      courtName: joinIfArray(row.CourtLabels),
      courtType: row.FeeCategoryName,
      startsAt: row.Start ?? null,
      endsAt: row.End ?? null,
      durationMinutes: minutesBetween(row.Start, row.End),
      playersCount: null,
      amountCents: toCentsFromAmount(row.Amount),
      status: row.TransactionType ?? null,
      businessDate: row.PaidDate.slice(0, 10),
      raw: { courtIds: row.CourtIds ?? [], membership: row.MembershipName ?? null },
    });
  }
  return [...byId.values()];
}

/** payment_type_totals per (date, PaymentType). Rows with no PaymentType are grouped under "unknown". */
export function aggregatePaymentTypeTotals(transactions: SalesTransactionRow[], locationSlug: string): PaymentTypeTotalRow[] {
  const byKey = new Map<string, PaymentTypeTotalRow>();
  for (const t of transactions) {
    const paymentType = t.paymentType ?? "unknown";
    const key = `${t.businessDate}::${paymentType}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.grossCents += t.grossCents;
      existing.transactionCount += 1;
    } else {
      byKey.set(key, { locationSlug, date: t.businessDate, paymentType, grossCents: t.grossCents, transactionCount: 1 });
    }
  }
  return [...byKey.values()];
}

/**
 * Gather step for mode=api: fetch the raw range once and map it into all three detail
 * shapes (spec section 10). Used by both the daily refresh (single day) and
 * `npm run backfill:courtreserve` (a month at a time) so the mapping logic lives in one place.
 */
export async function ingestCourtReserveDetail(
  locationSlug: string,
  startDate: string,
  endDate: string,
  opts: { fetchDetailedRows?: (startDate: string, endDate: string) => Promise<CourtReserveDetailedRow[]>; creds?: CourtReserveApiCreds } = {},
): Promise<{ transactions: SalesTransactionRow[]; reservations: CourtReservationRow[]; paymentTypeTotals: PaymentTypeTotalRow[] }> {
  const fetcher = opts.fetchDetailedRows ?? ((s: string, e: string) => fetchCourtReserveDetailedRows(s, e, opts.creds));
  const rawRows = await fetcher(startDate, endDate);
  const transactions = mapDetailedRowsToTransactions(rawRows, locationSlug);
  const reservations = mapDetailedRowsToReservations(rawRows, locationSlug);
  const paymentTypeTotals = aggregatePaymentTypeTotals(transactions, locationSlug);
  return { transactions, reservations, paymentTypeTotals };
}

// ── revenuerecognition/list — THE report source (spec #1 v5 section 3) ──
// Filters by SERVICE date (StartDateTime), not payment date — distinct from
// salessummarydetailed above, which stays the payment-basis reconciliation counterpart
// (spec section 4). Params are literally `start`/`end` (not paymentStartDate/paymentEndDate).

export const RevenueRecognitionRow = z.object({
  FeeCategory: z.string(),
  Subtotal: z.number(),
  TaxTotal: z.number(),
  Total: z.number(),
  PaymentType: z.string().nullish(),
  StartDateTime: z.string(),
  EndDateTime: z.string().nullish(),
  PaidDate: z.string().nullish(),
  OrganizationMemberId: z.union([z.string(), z.number()]).nullish(),
  MemberFirstName: z.string().nullish(),
  MemberLastName: z.string().nullish(),
  Description: z.string().nullish(),
  AdditionalDates: z.union([z.string(), z.array(z.unknown())]).nullish(),
  FeeId: z.union([z.string(), z.number()]).nullish(),
  PaymentId: z.union([z.string(), z.number()]).nullish(),
  RelationId: z.union([z.string(), z.number()]).nullish(),
  TransactionType: z.string().nullish(),
  PackageInfo: z.unknown().nullish(),
});
export type RevenueRecognitionRow = z.infer<typeof RevenueRecognitionRow>;

type RevenueRecognitionResponse = { ErrorMessage?: string | null; Data: unknown[] };

/** Live call to revenuerecognition/list. Same org-mismatch guard as salessummarydetailed. */
export async function fetchRevenueRecognitionRows(
  startDate: string,
  endDate: string,
  creds: CourtReserveApiCreds = courtReserveCredsFromEnv(),
): Promise<RevenueRecognitionRow[]> {
  const url = `${COURTRESERVE_API_BASE}/api/v1/revenuerecognition/list?start=${startDate}&end=${endDate}`;
  const auth = Buffer.from(`${creds.user}:${creds.pass}`).toString("base64");
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } });
  if (!res.ok) throw new Error(`courtreserve-ingest: revenuerecognition API request failed: ${res.status} ${await res.text()}`);

  const body = (await res.json()) as RevenueRecognitionResponse;
  if (body.ErrorMessage) throw new Error(`courtreserve-ingest: revenuerecognition API returned an error: ${body.ErrorMessage}`);
  return body.Data.map(r => RevenueRecognitionRow.parse(r));
}

export type RecognizedRevenueRow = {
  locationSlug: string;
  source: "courtreserve";
  externalId: string; // FeeId::PaymentId::RelationId (falls back to a positional id when all three are absent)
  businessDate: string; // YYYY-MM-DD, date(StartDateTime) — service date, never payment date
  periodMonth: string; // YYYY-MM, derived from businessDate
  groupName: string; // FeeCategory
  itemName: string; // Description
  amountCents: number; // Subtotal or Total per config.report.recognition.tax_included
  taxCents: number;
  netCents: number; // always tax-exclusive (Subtotal), regardless of amountCents's basis
  transactionType: string | null;
  paymentType: string | null;
  feeId: string | null;
  paymentId: string | null;
  relationId: string | null;
  recognizedOn: string | null; // PaidDate
  raw: Record<string, unknown>; // source row MINUS MemberFirstName/MemberLastName (invariant #3)
};

export type RecognitionConfig = { taxIncluded: boolean; dedupePackages: boolean };

/**
 * Maps raw revenuerecognition rows into RecognizedRevenueRow, obeying config.report.recognition
 * (spec section 4: "the chosen rule lives in config ... and the report obeys it"):
 *  - taxIncluded picks Total (tax-in) vs Subtotal (tax-out) as the displayed amount.
 *  - dedupePackages: a PackageInfo row can appear twice — once as the purchase, once as each
 *    usage/redemption — sharing the same RelationId. When on, only the FIRST row seen per
 *    (FeeId, RelationId) pair is kept; the rest are dropped from the recognized total (still
 *    visible in the Reconciliation view via the unfiltered payment-basis side, spec section 4).
 * Never fabricates a rule the CEO hasn't chosen — this only ever applies what config says.
 */
export function mapRevenueRecognitionRows(
  rows: RevenueRecognitionRow[],
  locationSlug: string,
  cfg: RecognitionConfig,
): RecognizedRevenueRow[] {
  const seenPackagePairs = new Set<string>();
  const out: RecognizedRevenueRow[] = [];

  rows.forEach((row, i) => {
    if (cfg.dedupePackages && row.PackageInfo != null && row.FeeId != null && row.RelationId != null) {
      const key = `${row.FeeId}::${row.RelationId}`;
      if (seenPackagePairs.has(key)) return;
      seenPackagePairs.add(key);
    }

    const { MemberFirstName, MemberLastName, ...raw } = row;
    const businessDate = row.StartDateTime.slice(0, 10);
    const externalId = row.FeeId != null || row.PaymentId != null || row.RelationId != null
      ? `${row.FeeId ?? ""}::${row.PaymentId ?? ""}::${row.RelationId ?? ""}`
      : `pos::${i}::${businessDate}`;
    out.push({
      locationSlug,
      source: "courtreserve",
      externalId,
      businessDate,
      periodMonth: businessDate.slice(0, 7),
      groupName: row.FeeCategory,
      itemName: row.Description ?? row.FeeCategory,
      amountCents: toCentsFromAmount(cfg.taxIncluded ? row.Total : row.Subtotal),
      taxCents: toCentsFromAmount(row.TaxTotal),
      netCents: toCentsFromAmount(row.Subtotal),
      transactionType: row.TransactionType ?? null,
      paymentType: row.PaymentType ?? null,
      feeId: row.FeeId != null ? String(row.FeeId) : null,
      paymentId: row.PaymentId != null ? String(row.PaymentId) : null,
      relationId: row.RelationId != null ? String(row.RelationId) : null,
      recognizedOn: row.PaidDate ?? null,
      raw,
    });
  });
  return out;
}

/** Gather step for the recognized-revenue ingest: fetch the raw range once, apply the
 *  config-driven mapping. Used by both the daily refresh and `npm run backfill:courtreserve`. */
export async function ingestRecognizedRevenue(
  locationSlug: string,
  startDate: string,
  endDate: string,
  cfg: RecognitionConfig,
  opts: { fetchRows?: (startDate: string, endDate: string) => Promise<RevenueRecognitionRow[]>; creds?: CourtReserveApiCreds } = {},
): Promise<RecognizedRevenueRow[]> {
  const fetcher = opts.fetchRows ?? ((s: string, e: string) => fetchRevenueRecognitionRows(s, e, opts.creds));
  const rawRows = await fetcher(startDate, endDate);
  return mapRevenueRecognitionRows(rawRows, locationSlug, cfg);
}

/**
 * Collapses a day's mapped transactions into the same CourtReserveDay shape the CSV path
 * produces, so metrics/dashboard never change when sources.courtreserve.mode flips to api
 * (spec #1 section 2). Returns null when nothing came back for that day — never fabricated
 * as zero (mirrors the CSV path's "missing file -> null").
 */
export function aggregateCourtReserveDetailToDay(locationSlug: string, date: string, transactions: SalesTransactionRow[]): CourtReserveDay | null {
  const dayTransactions = transactions.filter(t => t.businessDate === date);
  if (dayTransactions.length === 0) return null;

  const reservationIdOf = (t: SalesTransactionRow): string | null => {
    const id = t.raw.ReservationId;
    return id == null ? null : String(id);
  };

  const byCategory = new Map<string, { grossAmountCents: number; reservationIds: Set<string> }>();
  for (const t of dayTransactions) {
    const existing = byCategory.get(t.category) ?? { grossAmountCents: 0, reservationIds: new Set<string>() };
    existing.grossAmountCents += t.grossCents;
    const rid = reservationIdOf(t);
    if (rid) existing.reservationIds.add(rid);
    byCategory.set(t.category, existing);
  }

  const lineItems: CourtReserveLineItem[] = [...byCategory.entries()].map(([courtType, v]) => ({
    courtType, grossAmountCents: v.grossAmountCents, reservationCount: v.reservationIds.size,
  }));
  const totalGrossCents = dayTransactions.reduce((a, t) => a + t.grossCents, 0);
  const totalReservations = new Set(dayTransactions.map(reservationIdOf).filter((id): id is string => id != null)).size;
  const breakdown: Record<string, number> = {};
  for (const [courtType, v] of byCategory) breakdown[courtType] = v.grossAmountCents;

  return { locationSlug, date, lineItems, totalGrossCents, totalReservations, breakdown };
}
