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
import { ingestCourtReserveDay } from "../skills/courtreserve-ingest/index";
import { writeDay, traceRefresh, readTraces, type DailySalesRow, type RefreshStatus } from "../knowledge/index";
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
  locations: Record<string, { active: boolean }>;
  refresh?: { backfill_months?: number };
  sources: {
    gotab: { enabled: boolean; mode: "csv" | "api" };
    courtreserve: { enabled: boolean; mode: "csv" | "api"; locations?: string[] };
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
export async function refreshLocationDay(locationSlug: string, date: string, cfg: LoopsCfg = loadCfg()): Promise<LocationRefreshResult> {
  let gotabStatus: RefreshStatus = "missing";
  let courtreserveStatus: RefreshStatus = "missing";
  let error: string | undefined;
  const rows: DailySalesRow[] = [];

  try {
    const day = await ingestGotabDay(locationSlug, date, { mode: cfg.sources.gotab.mode });
    if (day) {
      gotabStatus = "loaded";
      rows.push({ locationSlug, date, source: "gotab", grossAmountCents: day.totalGrossCents, breakdown: day.breakdown });
    }
  } catch (e) {
    gotabStatus = "error";
    error = `gotab: ${(e as Error).message}`;
  }

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

  // Persistence failures (e.g. the warehouse schema isn't migrated yet) must never crash
  // the whole batch — every OTHER location/date still needs its refresh attempt and trace.
  try {
    if (rows.length) await writeDay(locationSlug, date, rows);
  } catch (e) {
    error = [error, `warehouse write: ${(e as Error).message}`].filter(Boolean).join("; ");
  }

  const status: "complete" | "incomplete" = gotabStatus === "loaded" && courtreserveStatus === "loaded" ? "complete" : "incomplete";
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
  return results;
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
