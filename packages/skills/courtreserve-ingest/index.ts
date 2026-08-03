/**
 * Skill: courtreserve-ingest (Agent A). Read-only court activity in, normalized rows out.
 * CSV today (mode: csv); API adapter plugs in when COURTRESERVE_API_KEY arrives — same shape out.
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
  opts: { mode?: "csv" | "api"; baseDir?: string } = {},
): Promise<CourtReserveDay | null> {
  const mode = opts.mode ?? "csv";
  if (mode === "api") {
    if (!process.env.COURTRESERVE_API_KEY) throw new Error("courtreserve-ingest: mode=api requires COURTRESERVE_API_KEY (falls back to csv when absent in config)");
    throw new Error("courtreserve-ingest: API adapter not wired yet — COURTRESERVE_API_KEY present but no endpoint configured");
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
    byDate.set(row.date, [...(byDate.get(row.date) ?? []), item]);
  }

  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, lineItems]) => {
    const totalGrossCents = lineItems.reduce((a, r) => a + r.grossAmountCents, 0);
    const totalReservations = lineItems.reduce((a, r) => a + r.reservationCount, 0);
    const breakdown: Record<string, number> = {};
    for (const r of lineItems) breakdown[r.courtType] = (breakdown[r.courtType] ?? 0) + r.grossAmountCents;
    return { date, lineItems, totalGrossCents, totalReservations, breakdown };
  });
}
