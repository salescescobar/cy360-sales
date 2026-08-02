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
