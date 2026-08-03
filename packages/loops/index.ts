/**
 * E · Loop Agent — background automation with brakes.
 * Executes playbooks/daily-sales-refresh.md: ingest both sources for every ACTIVE
 * location, mark the day complete only when both loaded, trace every attempt (success
 * or failure), and notify Slack when a day comes back incomplete. Caps + locations come
 * from config.yaml. Internal Slack alerts are not a `requireCheckpoint()` action — spec
 * #1 section 6 scopes this product's sensitive actions as "none" (read-only ingestion,
 * internal notifications only); checkpoints are reserved for spend/delete/customer-facing sends.
 */
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { ingestGotabDay } from "../skills/gotab-ingest/index";
import {
  ingestCourtReserveDay, ingestCourtReserveDetail, aggregateCourtReserveDetailToDay, ingestRecognizedRevenue,
  type CourtReserveDetailedRow, type RevenueRecognitionRow, type RecognitionConfig,
} from "../skills/courtreserve-ingest/index";
import { writeDay, readDay, readMonth, traceRefresh, readTraces, type DailySalesRow, type RefreshStatus } from "../knowledge/index";
import { replaceCourtReserveDetail } from "../knowledge/courtreserve";
import { replaceRecognizedRevenue, readRecognizedRevenue, listBusinessLineRules, tryRecordAlert } from "../knowledge/revenue";
import { computeGrowthReport, priorMonthOf, sameMonthLastYearOf, lastDayOfMonth, type GotabDayInput, type PeriodInput } from "../skills/growth-report/index";
import { repoPath } from "../core/paths";

export type Trigger =
  | { kind: "cron"; expr: string }
  | { kind: "webhook"; id: string }
  | { kind: "event"; name: string }
  | { kind: "threshold"; metric: string; above: number };

export type LoopOutcome =
  | { status: "done"; iterations: number; costUsd: number; auditTrailUrl: string }
  | { status: "escalated"; reason: string; auditTrailUrl: string }
  | { status: "capped"; cap: "iterations" | "budget"; auditTrailUrl: string };

export type LoopsCfg = {
  locations: Record<string, { active: boolean; gotab_slug?: string }>;
  refresh?: { backfill_months?: number };
  sources: {
    // "upload" (v2, spec #1 section 2): GoTab has no automated path — data arrives only
    // through an admin's confirmed /import upload. The daily refresh never auto-ingests it.
    gotab: { enabled: boolean; mode: "csv" | "api" | "browser" | "upload" };
    courtreserve: { enabled: boolean; mode: "csv" | "api"; locations?: string[] };
  };
  report?: {
    thresholds: { green_pct: number; red_pct: number };
    recognition: { tax_included: boolean; dedupe_packages: boolean };
    alerts: { slack: boolean; max_per_line_per_day: number };
  };
};

export function loadCfg(): LoopsCfg {
  return parse(readFileSync(repoPath("config.yaml"), "utf8")) as LoopsCfg;
}

export async function notifySlack(text: string): Promise<void> {
  const hook = process.env.SLACK_WEBHOOK_URL;
  if (!hook) return;
  await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => undefined);
}

export type LocationRefreshResult = {
  locationSlug: string;
  date: string;
  gotabStatus: RefreshStatus;
  courtreserveStatus: RefreshStatus;
  status: "complete" | "incomplete";
  error?: string;
};

/**
 * Refresh a single location/date. A source failing or missing never throws — it's
 * traced and reported so the day is flagged "incomplete", never presented as final
 * (criteria #3). Returns the same shape whether the caller is the cron loop or a dry run.
 */
export async function refreshLocationDay(
  locationSlug: string,
  date: string,
  cfg: LoopsCfg = loadCfg(),
  // Only set by scripts/gotab-refresh.ts (mode=browser), which supplies the Playwright
  // driver from gotab-ingest/browser.ts. Keeping it out of this signature's default wiring
  // is what keeps Playwright out of the Vercel serverless bundle for /api/cron/refresh.
  gotabOpts: { fetchText?: (locationSlug: string, date: string) => Promise<string> } = {},
  // Only set by tests and future scripts needing an offline/injected CourtReserve API
  // response — the real daily cron and /api/cron/refresh always go through the live client.
  courtreserveOpts: {
    fetchDetailedRows?: (startDate: string, endDate: string) => Promise<CourtReserveDetailedRow[]>;
    fetchRevenueRecognitionRows?: (startDate: string, endDate: string) => Promise<RevenueRecognitionRow[]>;
  } = {},
): Promise<LocationRefreshResult> {
  let gotabStatus: RefreshStatus = "missing";
  let courtreserveStatus: RefreshStatus = "missing";
  let error: string | undefined;
  let gotabDayOpen = false;
  const rows: DailySalesRow[] = [];

  if (cfg.sources.gotab.mode === "upload") {
    // GoTab has no automated path in v2 (spec section 2) — it only enters through a
    // confirmed /import upload, which already wrote its row and trace at confirm time.
    // The daily refresh just reflects whatever's already in the warehouse for this day.
    const existing = await readDay(locationSlug, date);
    gotabStatus = existing.some(r => r.source === "gotab") ? "loaded" : "missing";
  } else {
    try {
      const day = await ingestGotabDay(locationSlug, date, { mode: cfg.sources.gotab.mode, fetchText: gotabOpts.fetchText });
      if (day) {
        gotabStatus = "loaded";
        rows.push({ locationSlug, date, source: "gotab", grossAmountCents: day.totalGrossCents, breakdown: day.breakdown });
        // Browser mode only: GoTab keeps a fiscal day "open" (tabs still active) until it's
        // closed out. Its totals are provisional, so the row is still recorded but the day
        // must not be presented as a settled, final day (spec criterion #3).
        if (day.isOpen) {
          gotabDayOpen = true;
          error = [error, "gotab: day still open (Open Tabs > 0) — totals are provisional"].filter(Boolean).join("; ");
        }
      }
    } catch (e) {
      gotabStatus = "error";
      error = `gotab: ${(e as Error).message}`;
    }
  }

  if (cfg.sources.courtreserve.mode === "api") {
    try {
      const { transactions, reservations, paymentTypeTotals } = await ingestCourtReserveDetail(locationSlug, date, date, {
        fetchDetailedRows: courtreserveOpts.fetchDetailedRows,
      });
      const day = aggregateCourtReserveDetailToDay(locationSlug, date, transactions);
      if (day) {
        courtreserveStatus = "loaded";
        rows.push({ locationSlug, date, source: "courtreserve", grossAmountCents: day.totalGrossCents, breakdown: day.breakdown });
        // Detail persistence (spec section 10) is additive to the daily_sales aggregate
        // above — a failure here (e.g. schema not migrated yet) must not flip the day's
        // complete/incomplete status, only surface in the trace's error field.
        try {
          await replaceCourtReserveDetail(locationSlug, date, date, { transactions, reservations, paymentTypeTotals });
        } catch (e) {
          error = [error, `courtreserve detail write: ${(e as Error).message}`].filter(Boolean).join("; ");
        }
      }
      // Recognized revenue (spec #1 v5 section 3 — THE report source) is additive to the
      // salessummarydetailed-based detail above: same day, service-date basis instead of
      // payment-date. A failure here must not flip the day's complete/incomplete status
      // either — only surface in the trace's error field, same as the detail write above.
      try {
        const recognitionCfg: RecognitionConfig = { taxIncluded: cfg.report?.recognition.tax_included ?? false, dedupePackages: cfg.report?.recognition.dedupe_packages ?? true };
        const recognized = await ingestRecognizedRevenue(locationSlug, date, date, recognitionCfg, { fetchRows: courtreserveOpts.fetchRevenueRecognitionRows });
        await replaceRecognizedRevenue(locationSlug, date, date, recognized);
      } catch (e) {
        error = [error, `courtreserve recognized-revenue write: ${(e as Error).message}`].filter(Boolean).join("; ");
      }
    } catch (e) {
      courtreserveStatus = "error";
      error = [error, `courtreserve: ${(e as Error).message}`].filter(Boolean).join("; ");
    }
  } else {
    try {
      const day = await ingestCourtReserveDay(locationSlug, date, { mode: cfg.sources.courtreserve.mode });
      if (day) {
        courtreserveStatus = "loaded";
        rows.push({ locationSlug, date, source: "courtreserve", grossAmountCents: day.totalGrossCents, breakdown: day.breakdown });
      }
    } catch (e) {
      courtreserveStatus = "error";
      error = [error, `courtreserve: ${(e as Error).message}`].filter(Boolean).join("; ");
    }
  }

  // Persistence failures (e.g. the warehouse schema isn't migrated yet) must never crash
  // the whole batch — every OTHER location/date still needs its refresh attempt and trace.
  try {
    if (rows.length) await writeDay(locationSlug, date, rows);
  } catch (e) {
    error = [error, `warehouse write: ${(e as Error).message}`].filter(Boolean).join("; ");
  }

  const status: "complete" | "incomplete" =
    gotabStatus === "loaded" && courtreserveStatus === "loaded" && !gotabDayOpen ? "complete" : "incomplete";
  try {
    await traceRefresh({ locationSlug, date, at: new Date().toISOString(), gotabStatus, courtreserveStatus, status, error });
  } catch (e) {
    console.error(`refreshLocationDay: could not write trace for ${locationSlug} ${date}: ${(e as Error).message}`);
  }

  if (status === "incomplete") {
    await notifySlack(
      `⚠ CY360 Sales refresh incomplete — ${locationSlug} ${date}: gotab=${gotabStatus}, courtreserve=${courtreserveStatus}${error ? ` (${error})` : ""}`,
    );
  }
  return { locationSlug, date, gotabStatus, courtreserveStatus, status, error };
}

export function activeLocations(cfg: LoopsCfg = loadCfg()): string[] {
  return Object.entries(cfg.locations).filter(([, l]) => l.active).map(([slug]) => slug);
}

/** Runs the daily-sales-refresh playbook for one date across every active location. */
export async function runDailySalesRefresh(date: string, cfg: LoopsCfg = loadCfg()): Promise<LocationRefreshResult[]> {
  const results: LocationRefreshResult[] = [];
  for (const slug of activeLocations(cfg)) results.push(await refreshLocationDay(slug, date, cfg));
  // Alerts need the whole month's picture (this day's row alone can't tell a business line
  // it's up or down) — run once per refresh, after every location's day has landed.
  await runGrowthAlerts(date, cfg);
  return results;
}

/** Loads one calendar month's recognized-revenue + GoTab days for growth-report's
 *  PeriodInput shape — shared by the alert pipeline here and the /api/growth-report route
 *  (apps/web) so both compute from exactly the same warehouse reads. */
export async function buildPeriodInput(locationSlug: string, month: string): Promise<PeriodInput> {
  const from = `${month}-01`;
  const to = lastDayOfMonth(month);
  let courtRows: PeriodInput["courtRows"] = [];
  let courtreserveOk = true;
  try {
    courtRows = await readRecognizedRevenue(locationSlug, from, to);
  } catch {
    courtreserveOk = false;
  }
  const daysMap = await readMonth(locationSlug, month);
  const gotabDays: GotabDayInput[] = [...daysMap.entries()].map(([d, rows]) => {
    const gotab = rows.find(r => r.source === "gotab");
    return { date: d, status: gotab ? "complete" : "incomplete", breakdown: gotab?.breakdown ?? {} };
  });
  return { label: month, courtRows, gotabDays, courtreserveOk };
}

/**
 * Criterion #5: raise an alert when a line breaches report.thresholds versus EITHER
 * comparison, pushed to Slack at most once per day per line. `date` is the ET business date
 * the triggering refresh ran for — its month is "this month to date", elapsedDays is its
 * day-of-month, matching the dashboard's own growth report exactly (same inputs, same math).
 */
export async function runGrowthAlerts(date: string, cfg: LoopsCfg = loadCfg()): Promise<void> {
  if (cfg.report?.alerts.slack === false) return;
  const month = date.slice(0, 7);
  const elapsedDays = Number(date.slice(8, 10));
  const rules = await listBusinessLineRules();
  const thresholds = cfg.report?.thresholds ?? { green_pct: 5, red_pct: -5 };

  for (const locationSlug of activeLocations(cfg)) {
    const [current, priorMonth, lastYear] = await Promise.all([
      buildPeriodInput(locationSlug, month),
      buildPeriodInput(locationSlug, priorMonthOf(month)),
      buildPeriodInput(locationSlug, sameMonthLastYearOf(month)),
    ]);
    const report = computeGrowthReport({
      locationSlug, elapsedDays, current, priorMonth, lastYear, rules, thresholds,
      recognitionThroughDate: date,
    });
    for (const alert of report.alerts) {
      const sent = await tryRecordAlert({
        locationSlug, businessLine: alert.businessLine, sentOn: date, direction: alert.direction,
        comparison: alert.comparison, pct: alert.pct,
        message: `${alert.direction === "up" ? "📈" : "📉"} ${locationSlug} — ${alert.label} is ${alert.pct > 0 ? "+" : ""}${alert.pct}% vs ${alert.comparison === "prior_month" ? "prior month" : "same month last year"}`,
      });
      if (sent) await notifySlack(`${alert.direction === "up" ? "📈" : "📉"} CY360 Sales — ${locationSlug}: ${alert.label} is ${alert.pct > 0 ? "+" : ""}${alert.pct}% vs ${alert.comparison === "prior_month" ? "prior month" : "same month last year"}`);
    }
  }
}

/** Calendar date (YYYY-MM-DD) in America/New_York for an instant — the refresh always targets ET days. */
export function etDateString(d: Date, timeZone = "America/New_York"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function etYesterday(d: Date = new Date()): string {
  const [y, m, day] = etDateString(d).split("-").map(Number);
  const prior = new Date(Date.UTC(y, m - 1, day));
  prior.setUTCDate(prior.getUTCDate() - 1);
  return prior.toISOString().slice(0, 10);
}

export type WatchdogResult = { expectedDate: string; missedLocations: string[] };

/**
 * Criteria #6: if the 6:00 a.m. ET refresh didn't run, alert within 30 minutes. This is
 * a separate cron (config.yaml -> refresh.watchdog_cron, e.g. 06:30 ET) checking whether
 * every active location already has a trace row for the expected date; a missing trace
 * means the scheduled run never fired at all (distinct from "ran and came back incomplete",
 * which the refresh itself already reports).
 */
export function checkMissedRefresh(now: Date, traces: Array<{ locationSlug: string; date: string }>, cfg: LoopsCfg = loadCfg()): WatchdogResult {
  const expectedDate = etYesterday(now);
  const traced = new Set(traces.filter(t => t.date === expectedDate).map(t => t.locationSlug));
  const missedLocations = activeLocations(cfg).filter(slug => !traced.has(slug));
  return { expectedDate, missedLocations };
}

/** Full watchdog check + Slack alert, shared by scripts/watchdog.ts (manual/CI cron) and
 *  apps/web's Vercel Cron endpoint (/api/cron/watchdog) so the alert text lives in one place. */
export async function runWatchdog(now: Date = new Date(), cfg: LoopsCfg = loadCfg()): Promise<WatchdogResult> {
  const traces = await readTraces();
  const result = checkMissedRefresh(now, traces, cfg);
  if (result.missedLocations.length > 0) {
    await notifySlack(
      `🚨 CY360 Sales: no refresh ran for ${result.expectedDate} at ${result.missedLocations.join(", ")} — the 6:00 a.m. ET cron may not have fired.`,
    );
  }
  return result;
}

export async function run(trigger: Trigger, playbook: string): Promise<LoopOutcome> {
  if (playbook !== "daily-sales-refresh") throw new Error(`unknown playbook: ${playbook} — see playbooks/daily-sales-refresh.md`);
  const date = trigger.kind === "cron" ? etYesterday() : etDateString(new Date());
  const results = await runDailySalesRefresh(date);
  return {
    status: "done",
    iterations: results.length,
    costUsd: 0, // pure ingestion — no model calls in this playbook
    auditTrailUrl: ".local-storage/warehouse/refresh_runs.jsonl",
  };
}
