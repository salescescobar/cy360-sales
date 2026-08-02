/**
 * Self-test: CY360 Sales proves its own acceptance criteria (spec #1, section 5) plus
 * the shared framework infra (checkpoint, router, autonomous-loop budget policy) it runs on.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { repoPath } from "../packages/core/paths";

let pass = 0, fail = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try { await fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.log(`  ✗ ${name} — ${(e as Error).message}`); fail++; }
}
const assert = (c: unknown, msg: string) => { if (!c) throw new Error(msg); };

function createSlackCapture(onMessage: (text: string) => void): Promise<{ url: string; close: () => void }> {
  return new Promise(resolve => {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        try { onMessage(JSON.parse(body).text ?? body); } catch { onMessage(body); }
        res.writeHead(200);
        res.end("ok");
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

async function main() {
  console.log("\n▶ CY360 Sales self-test\n");

  // 1 · gotab-ingest: fixture day -> normalized rows with matching totals
  const { ingestGotabDay } = await import("../packages/skills/gotab-ingest/index");
  await t("gotab-ingest: fixture day -> normalized rows, totals match hand computation", async () => {
    const day = await ingestGotabDay("orlando", "2026-07-01");
    assert(day !== null, "expected fixture day, got null");
    assert(day!.totalGrossCents === 186775, `expected 186775 cents, got ${day!.totalGrossCents}`); // 842.50+415.25+610.00
    assert(day!.totalTransactions === 192, `expected 192 transactions, got ${day!.totalTransactions}`);
    assert(day!.breakdown.food === 84250 && day!.breakdown.alcohol === 61000, JSON.stringify(day!.breakdown));
  });
  await t("gotab-ingest: missing day -> null, never fabricated as zero", async () => {
    assert((await ingestGotabDay("orlando", "1999-01-01")) === null, "expected null for a day with no fixture");
  });

  // 2 · courtreserve-ingest: fixture day -> normalized rows with matching totals
  const { ingestCourtReserveDay } = await import("../packages/skills/courtreserve-ingest/index");
  await t("courtreserve-ingest: fixture day -> normalized rows, totals match hand computation", async () => {
    const day = await ingestCourtReserveDay("orlando", "2026-07-01");
    assert(day !== null, "expected fixture day, got null");
    assert(day!.totalGrossCents === 155000, `expected 155000 cents, got ${day!.totalGrossCents}`); // 1200.00+350.00
    assert(day!.totalReservations === 50, `expected 50 reservations, got ${day!.totalReservations}`);
    assert(day!.breakdown.pickleball === 120000 && day!.breakdown.tennis === 35000, JSON.stringify(day!.breakdown));
  });

  // 3 · metrics: fixture rows -> daily+monthly aggregates equal hand-computed values
  const { aggregateDaily, aggregateMonthly } = await import("../packages/skills/metrics/index");
  await t("metrics: complete day aggregates gotab + courtreserve", () => {
    const d = aggregateDaily({
      date: "2026-07-01",
      gotab: { totalGrossCents: 186775, breakdown: { food: 84250 } },
      courtreserve: { totalGrossCents: 155000, breakdown: { pickleball: 120000 } },
    });
    assert(d.status === "complete", "expected complete");
    assert(d.totalGrossCents === 341775, `expected 341775, got ${d.totalGrossCents}`);
  });
  await t("metrics: missing source -> incomplete, still sums what loaded", () => {
    const d = aggregateDaily({ date: "2026-07-02", gotab: { totalGrossCents: 99000, breakdown: {} }, courtreserve: null });
    assert(d.status === "incomplete", "expected incomplete");
    assert(d.totalGrossCents === 99000, `expected 99000, got ${d.totalGrossCents}`);
  });
  await t("metrics: monthly excludes incomplete days from totals and comparatives", () => {
    const days = [
      aggregateDaily({ date: "2026-07-01", gotab: { totalGrossCents: 100000, breakdown: {} }, courtreserve: { totalGrossCents: 50000, breakdown: {} } }),
      aggregateDaily({ date: "2026-07-02", gotab: { totalGrossCents: 999999, breakdown: {} }, courtreserve: null }), // incomplete — must be excluded
    ];
    const prior = [aggregateDaily({ date: "2026-06-01", gotab: { totalGrossCents: 100000, breakdown: {} }, courtreserve: { totalGrossCents: 50000, breakdown: {} } })];
    const m = aggregateMonthly("2026-07", days, prior);
    assert(m.totalGrossCents === 150000, `expected 150000 (incomplete day excluded), got ${m.totalGrossCents}`);
    assert(m.completeDays === 1 && m.incompleteDays === 1, JSON.stringify(m));
    assert(m.priorPeriod?.pctChange === 0, `expected 0% change vs an identical prior month, got ${m.priorPeriod?.pctChange}`);
  });

  // 4 · knowledge warehouse: local-fallback round trip + every attempt leaves a trace row
  const { writeDay, readDay, traceRefresh, readTraces } = await import("../packages/knowledge/index");
  const testLocation = `selftest-${Date.now()}`;
  await t("knowledge: writeDay/readDay round-trips normalized rows", async () => {
    await writeDay(testLocation, "2026-07-01", [{ locationSlug: testLocation, date: "2026-07-01", source: "gotab", grossAmountCents: 1234, breakdown: { food: 1234 } }]);
    const rows = await readDay(testLocation, "2026-07-01");
    assert(rows.length === 1 && rows[0].grossAmountCents === 1234, JSON.stringify(rows));
  });
  await t("knowledge: every refresh attempt leaves a trace row, even when incomplete (invariant #4)", async () => {
    await traceRefresh({ locationSlug: testLocation, date: "2026-07-02", at: new Date().toISOString(), gotabStatus: "loaded", courtreserveStatus: "missing", status: "incomplete" });
    const traces = await readTraces(testLocation);
    assert(traces.some(tr => tr.date === "2026-07-02" && tr.status === "incomplete"), JSON.stringify(traces));
  });

  // 5 · refresh playbook: dry run flags an incomplete day and notifies Slack
  const { refreshLocationDay } = await import("../packages/loops/index");
  await t("refresh: partial day (gotab loaded, courtreserve missing) is flagged incomplete + Slack notified", async () => {
    let notified: string | null = null;
    const capture = await createSlackCapture(text => { notified = text; });
    const prevHook = process.env.SLACK_WEBHOOK_URL;
    process.env.SLACK_WEBHOOK_URL = capture.url;
    try {
      const r = await refreshLocationDay("orlando", "2026-07-02"); // fixture: gotab CSV only, no courtreserve CSV that day
      assert(r.status === "incomplete", JSON.stringify(r));
      assert(r.gotabStatus === "loaded" && r.courtreserveStatus === "missing", JSON.stringify(r));
      assert(notified !== null && (notified as string).toLowerCase().includes("incomplete"), `Slack was not notified: ${notified}`);
    } finally {
      if (prevHook) process.env.SLACK_WEBHOOK_URL = prevHook; else delete process.env.SLACK_WEBHOOK_URL;
      capture.close();
    }
  });

  // 6 · checkpoint fails closed (shared infra — the hard gate any future sensitive action builds on)
  const { requireCheckpoint, CheckpointPending } = await import("../packages/core/checkpoint");
  await t("checkpoint: blocks without approval (fail closed)", async () => {
    delete process.env.AILABS_APPROVAL_TOKEN;
    try { await requireCheckpoint("delete_data", "test"); throw new Error("did not throw"); }
    catch (e) { assert(e instanceof CheckpointPending, "wrong error type"); }
  });
  await t("checkpoint: approves with a token", async () => {
    const r = await requireCheckpoint("spend_money", "test", { approvalToken: "tok" });
    assert(r.approved, "not approved");
  });

  // 7 · router: cheapest-capable ladder + escalation (shared infra, no model named outside it)
  const { route, estimateCostUsd } = await import("../packages/core/router");
  await t("router: classify stays cheapest even on retry", () => {
    assert(route("classify", { attempt: 3 }).rung === "cheap", "escaped its ceiling");
  });
  await t("router: code escalates one rung per failed attempt", () => {
    assert(route("code", { attempt: 1 }).rung === "mid" && route("code", { attempt: 2 }).rung === "top", "ladder wrong");
  });
  await t("router: cost estimate is sane", () => {
    const c = estimateCostUsd("claude-haiku-4-5", 1000, 500);
    assert(c > 0 && c < 0.01, `got ${c}`);
  });

  // 8 · budget policy: notify -> pause -> human approval -> resume (consumed)
  const loopDir = repoPath(".loop");
  await t("budget: past-budget run PAUSES awaiting approval (exit 3)", () => {
    rmSync(loopDir, { recursive: true, force: true });
    mkdirSync(loopDir, { recursive: true });
    writeFileSync(join(loopDir, "costs.jsonl"), JSON.stringify({ task: "code", model: "x", rung: "top", in: 1, out: 1, usd: 999 }) + "\n");
    const r = spawnSync("npx", ["tsx", "scripts/autonomous-loop.ts", "--simulate"], { encoding: "utf8" });
    assert(r.status === 3 && r.stdout.includes("PAUSED"), `status ${r.status}`);
  });
  await t("budget: human approval resumes the run and is consumed", () => {
    writeFileSync(join(loopDir, "budget-approved"), "");
    const r = spawnSync("npx", ["tsx", "scripts/autonomous-loop.ts", "--simulate"], { encoding: "utf8" });
    assert(r.status === 0 && r.stdout.includes("GATE PASSED"), `status ${r.status}`);
    assert(!existsSync(join(loopDir, "budget-approved")), "approval not consumed");
    rmSync(loopDir, { recursive: true, force: true });
  });

  rmSync(repoPath(".local-storage", "warehouse", testLocation), { recursive: true, force: true });

  console.log(`\n  ${pass} passed · ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}
main();
