/**
 * Skill: gotab-ingest (Agent A). Read-only F&B sales in, normalized rows out.
 * CSV today (mode: csv); API adapter plugs in when GOTAB_API_KEY arrives — same shape out.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { repoPath } from "../../core/paths";

export const GotabLineItem = z.object({
  category: z.string(),
  grossAmountCents: z.number().int(),
  transactionCount: z.number().int(),
});
export type GotabLineItem = z.infer<typeof GotabLineItem>;

export type GotabDay = {
  locationSlug: string;
  date: string; // YYYY-MM-DD
  lineItems: GotabLineItem[];
  totalGrossCents: number;
  totalTransactions: number;
  breakdown: Record<string, number>; // category -> gross cents
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
 * Normalize one day of GoTab sales for one location.
 * Returns null when the source has nothing for that day — never fabricated as zero,
 * so callers (refresh playbook) can tell "no sales" apart from "source didn't load".
 */
export async function ingestGotabDay(
  locationSlug: string,
  date: string,
  opts: { mode?: "csv" | "api"; baseDir?: string } = {},
): Promise<GotabDay | null> {
  const mode = opts.mode ?? "csv";
  if (mode === "api") {
    if (!process.env.GOTAB_API_KEY) throw new Error("gotab-ingest: mode=api requires GOTAB_API_KEY (falls back to csv when absent in config)");
    throw new Error("gotab-ingest: API adapter not wired yet — GOTAB_API_KEY present but no endpoint configured");
  }
  const path = join(opts.baseDir ?? repoPath("data/imports/gotab"), locationSlug, `${date}.csv`);
  if (!existsSync(path)) return null;

  const rows = parseCsv(readFileSync(path, "utf8"));
  const lineItems: GotabLineItem[] = rows.map(r => GotabLineItem.parse({
    category: r.category,
    grossAmountCents: toCents(r.gross_amount),
    transactionCount: parseInt(r.transaction_count, 10),
  }));

  const totalGrossCents = lineItems.reduce((a, r) => a + r.grossAmountCents, 0);
  const totalTransactions = lineItems.reduce((a, r) => a + r.transactionCount, 0);
  const breakdown: Record<string, number> = {};
  for (const r of lineItems) breakdown[r.category] = (breakdown[r.category] ?? 0) + r.grossAmountCents;

  return { locationSlug, date, lineItems, totalGrossCents, totalTransactions, breakdown };
}
