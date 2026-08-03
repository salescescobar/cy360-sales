/**
 * Skill: gotab-ingest (Agent A). Read-only F&B sales in, normalized rows out.
 * CSV today (mode: csv); API adapter plugs in when GOTAB_API_KEY arrives — same shape out.
 * Browser mode (mode: browser) logs into manager.gotab.io with Playwright and reads the
 * sales page directly — this is the real production path until a GoTab API key exists.
 * It runs outside Vercel (see .github/workflows/daily-refresh.yml): Vercel's serverless
 * functions have no writable disk for a Chromium profile and don't ship the browser binary.
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
  // Browser mode only: GoTab's fiscal day stays "open" (tabs still active) until it's
  // closed out. An open day's totals are provisional — never final (spec criterion #3) —
  // so callers must flag the refresh "incomplete" rather than present it as a settled day.
  openTabs?: number;
  isOpen?: boolean;
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "1,234.56" -> 1234.56, "-" -> 0 (GoTab prints "-" for a zero field). */
function parseNumberOrDash(raw: string): number {
  return raw === "-" ? 0 : parseFloat(raw.replace(/,/g, ""));
}

/** Pulls `LABEL\n  VALUE` out of GoTab's sales-page innerText. Throws if the label is
 *  missing — a changed page layout must surface as a load error, never a fabricated 0. */
function extractLabelValue(text: string, label: string): number {
  const re = new RegExp(`${escapeRegExp(label)}\\s*\\n\\s*([\\d,.]+|-)`);
  const m = text.match(re);
  if (!m) throw new Error(`gotab-ingest: could not find "${label}" on the sales page`);
  return parseNumberOrDash(m[1]);
}

const GOTAB_MONEY_LABELS: Record<string, string> = {
  grossSales: "Gross Sales",
  discounts: "Discounts",
  compsRefunds: "Comps & Refunds",
  totalNetSales: "Total Net Sales",
  tax: "Tax",
  tips: "Tips",
  externalPayouts: "External Payouts",
};

/**
 * Normalize one day of GoTab sales from the sales page's `main.innerText` (browser mode).
 * Pure text-in, GotabDay-out — no Playwright dependency, so it's unit-testable against a
 * saved innerText fixture without a real browser or credentials.
 */
export function extractGotabDayFromText(locationSlug: string, date: string, text: string): GotabDay {
  const money: Record<string, number> = {};
  for (const [key, label] of Object.entries(GOTAB_MONEY_LABELS)) {
    money[key] = Math.round(extractLabelValue(text, label) * 100);
  }
  const totalTabs = Math.round(extractLabelValue(text, "Total Tabs"));
  const openTabs = Math.round(extractLabelValue(text, "Open Tabs"));

  const breakdown: Record<string, number> = {
    discounts: money.discounts,
    comps_refunds: money.compsRefunds,
    total_net_sales: money.totalNetSales,
    tax: money.tax,
    tips: money.tips,
    external_payouts: money.externalPayouts,
  };

  return {
    locationSlug,
    date,
    lineItems: [],
    totalGrossCents: money.grossSales,
    totalTransactions: totalTabs,
    breakdown,
    openTabs,
    isOpen: openTabs > 0,
  };
}

/**
 * Normalize one day of GoTab sales for one location.
 * Returns null when the source has nothing for that day — never fabricated as zero,
 * so callers (refresh playbook) can tell "no sales" apart from "source didn't load".
 */
export async function ingestGotabDay(
  locationSlug: string,
  date: string,
  opts: { mode?: "csv" | "api" | "browser"; baseDir?: string; fetchText?: (locationSlug: string, date: string) => Promise<string> } = {},
): Promise<GotabDay | null> {
  const mode = opts.mode ?? "csv";
  if (mode === "api") {
    if (!process.env.GOTAB_API_KEY) throw new Error("gotab-ingest: mode=api requires GOTAB_API_KEY (falls back to csv when absent in config)");
    throw new Error("gotab-ingest: API adapter not wired yet — GOTAB_API_KEY present but no endpoint configured");
  }
  if (mode === "browser") {
    // No Playwright import lives in this module (or anything it's imported by, e.g.
    // packages/loops/index.ts / apps/web) — that keeps the browser driver, and the
    // Chromium binary it pulls in, out of the Vercel serverless bundle entirely. The
    // driver lives in gotab-ingest/browser.ts and is wired in only by scripts/gotab-refresh.ts.
    if (!opts.fetchText) throw new Error("gotab-ingest: mode=browser requires opts.fetchText — see packages/skills/gotab-ingest/browser.ts");
    const text = await opts.fetchText(locationSlug, date);
    return extractGotabDayFromText(locationSlug, date, text);
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

const GOTAB_EXPORT_COLUMNS = ["date", "category", "gross_amount", "transaction_count"] as const;

export type GotabExportDay = {
  date: string;
  lineItems: GotabLineItem[];
  totalGrossCents: number;
  totalTransactions: number;
  breakdown: Record<string, number>;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Header sniff for the web upload flow (criterion #1: "detect which source"). Exact-match
 *  on the required column set — a near-miss (missing/renamed column) is a malformed file,
 *  not a silent partial parse. */
export function looksLikeGotabExport(header: string[]): boolean {
  return GOTAB_EXPORT_COLUMNS.every(c => header.includes(c));
}

/**
 * Parse a raw GoTab CSV export (web upload) into one or more days — a single export can
 * cover a date range (criterion #1: "which date(s) it covers"). Throws a specific,
 * human-readable message naming the problem on anything malformed/empty/unrecognized
 * (criterion #8) — never fabricates a partial parse.
 */
export function parseGotabCsvExport(text: string): GotabExportDay[] {
  const lines = text.trim().split("\n").filter(l => l.length > 0);
  if (lines.length === 0) throw new Error("gotab-ingest: the file is empty — no rows found");

  const header = lines[0].split(",").map(h => h.trim());
  if (!looksLikeGotabExport(header)) {
    throw new Error(`gotab-ingest: unrecognized CSV format — expected columns ${GOTAB_EXPORT_COLUMNS.join(", ")}, got: ${header.join(", ")}`);
  }
  if (lines.length === 1) throw new Error("gotab-ingest: the file has a header but no data rows");

  const byDate = new Map<string, GotabLineItem[]>();
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map(c => c.trim());
    const row = Object.fromEntries(header.map((h, idx) => [h, cells[idx]]));
    const rowNum = i + 1; // 1-indexed, header is row 1

    if (!row.date || !DATE_RE.test(row.date)) throw new Error(`gotab-ingest: row ${rowNum} has an invalid date "${row.date ?? ""}" — expected YYYY-MM-DD`);
    if (!row.category) throw new Error(`gotab-ingest: row ${rowNum} is missing a category`);
    const grossAmountCents = toCents(row.gross_amount);
    if (!Number.isFinite(grossAmountCents)) throw new Error(`gotab-ingest: row ${rowNum} has a non-numeric gross_amount "${row.gross_amount ?? ""}"`);
    const transactionCount = parseInt(row.transaction_count, 10);
    if (!Number.isFinite(transactionCount)) throw new Error(`gotab-ingest: row ${rowNum} has a non-numeric transaction_count "${row.transaction_count ?? ""}"`);

    const item = GotabLineItem.parse({ category: row.category, grossAmountCents, transactionCount });
    const existing = byDate.get(row.date);
    if (existing) existing.push(item); else byDate.set(row.date, [item]);
  }

  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, lineItems]) => {
    const totalGrossCents = lineItems.reduce((a, r) => a + r.grossAmountCents, 0);
    const totalTransactions = lineItems.reduce((a, r) => a + r.transactionCount, 0);
    const breakdown: Record<string, number> = {};
    for (const r of lineItems) breakdown[r.category] = (breakdown[r.category] ?? 0) + r.grossAmountCents;
    return { date, lineItems, totalGrossCents, totalTransactions, breakdown };
  });
}
