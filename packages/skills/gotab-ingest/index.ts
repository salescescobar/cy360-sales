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
