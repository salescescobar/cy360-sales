/**
 * Self-test: CY360 Sales proves its own acceptance criteria (spec #1 v2, section 6) plus
 * the shared framework infra (checkpoint, router, autonomous-loop budget policy) it runs on.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoPath } from "../packages/core/paths";

let pass = 0, fail = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try { await fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.log(`  ✗ ${name} — ${(e as Error).message}`); fail++; }
}
const assert = (c: unknown, msg: string) => { if (!c) throw new Error(msg); };

async function main() {
  console.log("\n▶ CY360 Sales self-test\n");

  // Self-test always exercises the LOCAL warehouse fallback, regardless of whatever
  // Supabase credentials happen to be in the ambient shell — reproducible in CI with
  // zero secrets, same guarantee the original template made for storage.ts.
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;

  // 1 · gotab-ingest: real-shaped CSV export fixture -> normalized rows, totals match the file
  const { parseGotabCsvExport } = await import("../packages/skills/gotab-ingest/index");
  const gotabFixture = readFileSync(repoPath("packages/skills/gotab-ingest/fixtures/orlando-export-sample.csv"), "utf8");
  await t("gotab-ingest: real CSV export fixture -> normalized rows, totals match the file", () => {
    const days = parseGotabCsvExport(gotabFixture);
    assert(days.length === 2, `expected 2 days, got ${days.length}`);
    const [d1, d2] = days;
    assert(d1.date === "2026-07-01" && d1.totalGrossCents === 145250 && d1.totalTransactions === 165, JSON.stringify(d1));
    assert(d1.breakdown.food === 84250 && d1.breakdown.alcohol === 61000, JSON.stringify(d1.breakdown));
    assert(d2.date === "2026-07-02" && d2.totalGrossCents === 53525 && d2.totalTransactions === 80, JSON.stringify(d2));
  });
  await t("gotab-ingest: empty file is rejected, naming the problem", () => {
    try { parseGotabCsvExport(""); throw new Error("did not throw"); }
    catch (e) { assert((e as Error).message.toLowerCase().includes("empty"), (e as Error).message); }
  });
  await t("gotab-ingest: malformed row (bad gross_amount) is rejected, naming the row", () => {
    try { parseGotabCsvExport("date,category,gross_amount,transaction_count\n2026-07-01,food,not-a-number,10"); throw new Error("did not throw"); }
    catch (e) { assert((e as Error).message.includes("row 2") && (e as Error).message.includes("gross_amount"), (e as Error).message); }
  });

  // 2 · courtreserve-ingest: real-shaped CSV export fixture -> normalized rows, totals match
  const { parseCourtReserveCsvExport } = await import("../packages/skills/courtreserve-ingest/index");
  const courtreserveFixture = readFileSync(repoPath("packages/skills/courtreserve-ingest/fixtures/orlando-export-sample.csv"), "utf8");
  await t("courtreserve-ingest: real CSV export fixture -> normalized rows, totals match the file", () => {
    const days = parseCourtReserveCsvExport(courtreserveFixture);
    assert(days.length === 2, `expected 2 days, got ${days.length}`);
    const [d1, d2] = days;
    assert(d1.date === "2026-07-01" && d1.totalGrossCents === 155000 && d1.totalReservations === 50, JSON.stringify(d1));
    assert(d1.breakdown.pickleball === 120000 && d1.breakdown.tennis === 35000, JSON.stringify(d1.breakdown));
    assert(d2.date === "2026-07-02" && d2.totalGrossCents === 30000 && d2.totalReservations === 12, JSON.stringify(d2));
  });

  // 3 · upload-ingest: detect source from header, reject unrecognized formats (criterion #1, #8)
  const { detectAndParseUpload } = await import("../packages/skills/upload-ingest/index");
  await t("upload-ingest: detects gotab vs courtreserve from header alone", () => {
    assert(detectAndParseUpload(gotabFixture, "export.csv").source === "gotab", "expected gotab");
    assert(detectAndParseUpload(courtreserveFixture, "export.csv").source === "courtreserve", "expected courtreserve");
  });
  await t("upload-ingest: unrecognized format is rejected with a specific message, nothing parsed", () => {
    try { detectAndParseUpload("name,amount\nfoo,1", "mystery.csv"); throw new Error("did not throw"); }
    catch (e) { assert((e as Error).message.includes("unrecognized"), (e as Error).message); }
  });

  // 4 · metrics: fixture rows -> day and month aggregates equal hand-computed values
  const { aggregateDaily, aggregateMonthly } = await import("../packages/skills/metrics/index");
  await t("metrics: complete day aggregates gotab + courtreserve", () => {
    const d = aggregateDaily({
      date: "2026-07-01",
      gotab: { totalGrossCents: 145250, breakdown: { food: 84250 } },
      courtreserve: { totalGrossCents: 155000, breakdown: { pickleball: 120000 } },
    });
    assert(d.status === "complete", "expected complete");
    assert(d.totalGrossCents === 300250, `expected 300250, got ${d.totalGrossCents}`);
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
    const m = aggregateMonthly("2026-07", days, { month: "2026-06", days: prior });
    assert(m.totalGrossCents === 150000, `expected 150000 (incomplete day excluded), got ${m.totalGrossCents}`);
    assert(m.completeDays === 1 && m.incompleteDays === 1, JSON.stringify(m));
    assert(m.priorPeriod?.pctChange === 0, `expected 0% change vs an identical prior month, got ${m.priorPeriod?.pctChange}`);
    assert(m.priorPeriod?.label === "July vs June", `expected full-month label, got ${m.priorPeriod?.label}`);
  });
  await t("metrics: partial current month compares like-for-like (criterion #5)", () => {
    const augDays = [
      aggregateDaily({ date: "2026-08-01", gotab: { totalGrossCents: 1000, breakdown: {} }, courtreserve: { totalGrossCents: 0, breakdown: {} } }),
      aggregateDaily({ date: "2026-08-02", gotab: { totalGrossCents: 2000, breakdown: {} }, courtreserve: { totalGrossCents: 0, breakdown: {} } }),
    ];
    const julyDays = [
      aggregateDaily({ date: "2026-07-01", gotab: { totalGrossCents: 500, breakdown: {} }, courtreserve: { totalGrossCents: 0, breakdown: {} } }),
      aggregateDaily({ date: "2026-07-02", gotab: { totalGrossCents: 600, breakdown: {} }, courtreserve: { totalGrossCents: 0, breakdown: {} } }),
      // Beyond the elapsed window — a raw full-month comparison would wrongly include this.
      aggregateDaily({ date: "2026-07-03", gotab: { totalGrossCents: 999999, breakdown: {} }, courtreserve: { totalGrossCents: 0, breakdown: {} } }),
    ];
    const m = aggregateMonthly("2026-08", augDays, { month: "2026-07", days: julyDays }, { elapsedDays: 2 });
    assert(m.priorPeriod?.totalGrossCents === 1100, `expected prior total 1100 (July 3 excluded), got ${m.priorPeriod?.totalGrossCents}`);
    assert(m.priorPeriod?.label === "first 2 days vs first 2 days of July", `unexpected label: ${m.priorPeriod?.label}`);
    assert(m.priorPeriod?.pctChange === 172.73, `expected 172.73% change, got ${m.priorPeriod?.pctChange}`);
  });

  // 5 · knowledge warehouse: local-fallback round trip, replace-not-duplicate, and every
  // confirmed import leaves a trace row reflecting which sources are now present
  const { writeDay, readDay, traceImportedDay, traceRefresh, readTraces, recordImportUpload } = await import("../packages/knowledge/index");
  const testLocation = `selftest-${Date.now()}`;
  await t("knowledge: writeDay/readDay round-trips normalized rows", async () => {
    await writeDay(testLocation, "2026-07-01", [{ locationSlug: testLocation, date: "2026-07-01", source: "gotab", grossAmountCents: 1234, breakdown: { food: 1234 } }]);
    const rows = await readDay(testLocation, "2026-07-01");
    assert(rows.length === 1 && rows[0].grossAmountCents === 1234, JSON.stringify(rows));
  });
  await t("knowledge: re-uploading a (location, date, source) replaces the row, never duplicates it (criterion #6)", async () => {
    await writeDay(testLocation, "2026-07-01", [{ locationSlug: testLocation, date: "2026-07-01", source: "gotab", grossAmountCents: 9999, breakdown: { food: 9999 } }]);
    const rows = await readDay(testLocation, "2026-07-01");
    assert(rows.filter(r => r.source === "gotab").length === 1, `expected exactly one gotab row, got ${JSON.stringify(rows)}`);
    assert(rows.find(r => r.source === "gotab")?.grossAmountCents === 9999, JSON.stringify(rows));
  });
  await t("knowledge: traceImportedDay reflects which sources are actually present (criterion #2, invariant #4)", async () => {
    const afterGotabOnly = await traceImportedDay(testLocation, "2026-07-01");
    assert(afterGotabOnly.gotabStatus === "loaded" && afterGotabOnly.courtreserveStatus === "missing" && afterGotabOnly.status === "incomplete", JSON.stringify(afterGotabOnly));

    await writeDay(testLocation, "2026-07-01", [{ locationSlug: testLocation, date: "2026-07-01", source: "courtreserve", grossAmountCents: 500, breakdown: {} }]);
    const afterBoth = await traceImportedDay(testLocation, "2026-07-01");
    assert(afterBoth.status === "complete", JSON.stringify(afterBoth));

    const traces = await readTraces(testLocation);
    assert(traces.filter(tr => tr.date === "2026-07-01").length >= 2, "expected a trace row from each import, invariant #4");
  });
  await t("knowledge: every refresh attempt leaves a trace row, even when incomplete (invariant #4)", async () => {
    await traceRefresh({ locationSlug: testLocation, date: "2026-07-02", at: new Date().toISOString(), gotabStatus: "loaded", courtreserveStatus: "missing", status: "incomplete" });
    const traces = await readTraces(testLocation);
    assert(traces.some(tr => tr.date === "2026-07-02" && tr.status === "incomplete"), JSON.stringify(traces));
  });
  await t("knowledge: recordImportUpload persists a raw-file pointer (criterion #2's raw-file copy)", async () => {
    await recordImportUpload({ locationSlug: testLocation, source: "gotab", date: "2026-07-01", storagePath: `${testLocation}/gotab/2026-07-01-test.csv`, originalFilename: "test.csv" });
    const importsFile = repoPath(".local-storage", "warehouse", "import_uploads.jsonl");
    assert(existsSync(importsFile), "import_uploads.jsonl was not written");
    assert(readFileSync(importsFile, "utf8").includes(testLocation), "record for this test location not found");
  });

  // 6 · business-lines: resolves via business_line_map (never hardcoded), unmapped when nothing matches
  const { resolveBusinessLine, DEFAULT_BUSINESS_LINE_RULES, UNMAPPED } = await import("../packages/skills/business-lines/index");
  await t("business-lines: CourtReserve FeeCategory values resolve to the right line", () => {
    assert(resolveBusinessLine(DEFAULT_BUSINESS_LINE_RULES, "courtreserve", "Membership Fee", "Annual Membership") === "memberships", "membership");
    assert(resolveBusinessLine(DEFAULT_BUSINESS_LINE_RULES, "courtreserve", "Reservation", "Indoor Pickleball") === "pickleball", "reservation");
    assert(resolveBusinessLine(DEFAULT_BUSINESS_LINE_RULES, "courtreserve", "Event Registration", "Fall Tournament") === "events", "event");
  });
  await t("business-lines: a Package item name picks the specific rule over the generic one", () => {
    assert(resolveBusinessLine(DEFAULT_BUSINESS_LINE_RULES, "courtreserve", "Package", "10-pack lesson bundle") === "lessons", "package->lessons");
  });
  await t("business-lines: nothing matches -> unmapped, never dropped (criterion #4)", () => {
    assert(resolveBusinessLine(DEFAULT_BUSINESS_LINE_RULES, "courtreserve", "Some New Fee Type", "Mystery Item") === UNMAPPED, "expected unmapped");
  });
  await t("business-lines: GoTab categories resolve too", () => {
    assert(resolveBusinessLine(DEFAULT_BUSINESS_LINE_RULES, "gotab", "food", "food") === "food_beverage", "food");
    assert(resolveBusinessLine(DEFAULT_BUSINESS_LINE_RULES, "gotab", "arcade", "arcade") === "arcade", "arcade");
  });
  await t("business-lines: GoTab's real daily-summary shape (uncategorized) resolves to food_beverage, not Unmapped (business_lines)", () => {
    assert(resolveBusinessLine(DEFAULT_BUSINESS_LINE_RULES, "gotab", "uncategorized", "uncategorized") === "food_beverage", "uncategorized should default to food_beverage");
  });
  await t("business-lines: a real CourtReserve group name resolves even with stray whitespace (business_lines)", () => {
    assert(resolveBusinessLine(DEFAULT_BUSINESS_LINE_RULES, "courtreserve", " Reservation ", "Indoor Pickleball") === "pickleball", "trimmed exact match should still resolve");
  });

  // 7 · courtreserve-ingest: revenuerecognition/list mapping — PII dropped, config-driven
  // tax basis, dedupe_packages collapses a purchase+usage pair sharing (FeeId, RelationId)
  const { mapRevenueRecognitionRows } = await import("../packages/skills/courtreserve-ingest/index");
  const recognitionFixture = [
    { FeeCategory: "Reservation", Subtotal: 100, TaxTotal: 7, Total: 107, StartDateTime: "2026-08-01T10:00:00", PaidDate: "2026-08-01", MemberFirstName: "Jane", MemberLastName: "Doe", Description: "Indoor Pickleball", FeeId: "f1", PaymentId: "p1", RelationId: null, TransactionType: "Sale", PackageInfo: null },
    { FeeCategory: "Package", Subtotal: 200, TaxTotal: 0, Total: 200, StartDateTime: "2026-08-02T10:00:00", PaidDate: "2026-08-02", MemberFirstName: "Ann", MemberLastName: "Lee", Description: "Lesson bundle", FeeId: "f2", PaymentId: "p2", RelationId: "r1", TransactionType: "Purchase", PackageInfo: { sessions: 5 } },
    { FeeCategory: "Package", Subtotal: 200, TaxTotal: 0, Total: 200, StartDateTime: "2026-08-03T10:00:00", PaidDate: "2026-08-03", MemberFirstName: "Ann", MemberLastName: "Lee", Description: "Lesson bundle", FeeId: "f2", PaymentId: "p3", RelationId: "r1", TransactionType: "Redemption", PackageInfo: { sessions: 5 } },
  ];
  await t("courtreserve-ingest: revenuerecognition mapping drops MemberFirstName/MemberLastName (invariant #3)", () => {
    const mapped = mapRevenueRecognitionRows(recognitionFixture as any, "orlando", { taxIncluded: false, dedupePackages: false });
    for (const r of mapped) {
      assert(!("MemberFirstName" in r.raw) && !("MemberLastName" in r.raw), `PII leaked into raw: ${JSON.stringify(r.raw)}`);
    }
  });
  await t("courtreserve-ingest: taxIncluded=false uses Subtotal, true uses Total", () => {
    const exclTax = mapRevenueRecognitionRows([recognitionFixture[0]] as any, "orlando", { taxIncluded: false, dedupePackages: false });
    assert(exclTax[0].amountCents === 10000, `expected 10000 (Subtotal), got ${exclTax[0].amountCents}`);
    const inclTax = mapRevenueRecognitionRows([recognitionFixture[0]] as any, "orlando", { taxIncluded: true, dedupePackages: false });
    assert(inclTax[0].amountCents === 10700, `expected 10700 (Total), got ${inclTax[0].amountCents}`);
  });
  await t("courtreserve-ingest: dedupe_packages collapses the purchase+redemption pair sharing (FeeId, RelationId) (spec section 4)", () => {
    const withDedupe = mapRevenueRecognitionRows(recognitionFixture as any, "orlando", { taxIncluded: false, dedupePackages: true });
    assert(withDedupe.length === 2, `expected 2 rows (1 reservation + 1 of the package pair), got ${withDedupe.length}`);
    const withoutDedupe = mapRevenueRecognitionRows(recognitionFixture as any, "orlando", { taxIncluded: false, dedupePackages: false });
    assert(withoutDedupe.length === 3, `expected all 3 rows without dedupe, got ${withoutDedupe.length}`);
  });

  // 8 · growth-report: three columns, labeled %, days row, Gross/Discounts/Total rollup,
  // incomplete-period labeling, and threshold alerts (spec section 6 criteria #1, #2, #5, #6)
  const { computeGrowthReport } = await import("../packages/skills/growth-report/index");
  const growthRules = DEFAULT_BUSINESS_LINE_RULES;
  const rowsFor = (date: string, groupName: string, amountCents: number) => ({
    locationSlug: "orlando", source: "courtreserve" as const, externalId: `${date}-${groupName}-${amountCents}`,
    businessDate: date, periodMonth: date.slice(0, 7), groupName, itemName: groupName,
    amountCents, taxCents: 0, netCents: amountCents, transactionType: null, paymentType: null,
    feeId: null, paymentId: null, relationId: null, recognizedOn: date, raw: {},
  });
  await t("growth-report: three columns + labeled % + days row + Gross/Discounts/Total, elapsed days respected", () => {
    const report = computeGrowthReport({
      locationSlug: "orlando",
      elapsedDays: 2,
      current: { label: "2026-08", courtRows: [rowsFor("2026-08-01", "Reservation", 10000), rowsFor("2026-08-02", "Reservation", 5000), rowsFor("2026-08-03", "Reservation", 999999)], gotabDays: [], courtreserveOk: true },
      priorMonth: { label: "2026-07", courtRows: [rowsFor("2026-07-01", "Reservation", 8000), rowsFor("2026-07-02", "Reservation", 4000)], gotabDays: [], courtreserveOk: true },
      lastYear: { label: "2025-08", courtRows: [rowsFor("2025-08-01", "Reservation", 6000), rowsFor("2025-08-02", "Reservation", 4000)], gotabDays: [], courtreserveOk: true },
      rules: growthRules,
      thresholds: { green_pct: 5, red_pct: -5 },
      recognitionThroughDate: "2026-08-02",
    });
    const pickleball = report.rows.find(r => r.businessLine === "pickleball")!;
    assert(pickleball.current === 15000, `expected 15000 (Aug 3 excluded by elapsedDays), got ${pickleball.current}`);
    assert(pickleball.priorMonth === 12000, JSON.stringify(pickleball));
    assert(pickleball.lastYear === 10000, JSON.stringify(pickleball));
    assert(pickleball.vsPriorMonthPct === 25, `expected +25%, got ${pickleball.vsPriorMonthPct}`);
    assert(pickleball.vsLastYearPct === 50, `expected +50%, got ${pickleball.vsLastYearPct}`);
    assert(report.daysRow.current === 2 && report.daysRow.priorMonth === 2 && report.daysRow.lastYear === 2, JSON.stringify(report.daysRow));
    assert(report.comparisonLabels.priorMonth.includes("2026-07") && report.comparisonLabels.lastYear.includes("2025-08"), JSON.stringify(report.comparisonLabels));
    const gross = report.rows.find(r => r.businessLine === "gross_revenues")!;
    const total = report.rows.find(r => r.businessLine === "total")!;
    assert(gross.current === 15000 && total.current === 15000, `Gross/Total should equal the only populated line, got ${JSON.stringify({ gross, total })}`);
  });
  await t("growth-report: negative amounts become Discounts, never netted invisibly into a business line", () => {
    const report = computeGrowthReport({
      locationSlug: "orlando", elapsedDays: 1,
      current: { label: "2026-08", courtRows: [rowsFor("2026-08-01", "Reservation", 10000), rowsFor("2026-08-01", "Reservation", -1000)], gotabDays: [], courtreserveOk: true },
      priorMonth: { label: "2026-07", courtRows: [], gotabDays: [], courtreserveOk: true },
      lastYear: { label: "2025-08", courtRows: [], gotabDays: [], courtreserveOk: true },
      rules: growthRules, thresholds: { green_pct: 5, red_pct: -5 }, recognitionThroughDate: "2026-08-01",
    });
    const pickleball = report.rows.find(r => r.businessLine === "pickleball")!;
    const discounts = report.rows.find(r => r.businessLine === "discounts")!;
    const total = report.rows.find(r => r.businessLine === "total")!;
    assert(pickleball.current === 10000, `business line should never absorb the discount, got ${pickleball.current}`);
    assert(discounts.current === -1000, `expected -1000 discount, got ${discounts.current}`);
    assert(total.current === 9000, `expected gross+discounts=9000, got ${total.current}`);
  });
  await t("growth-report: an incomplete/open GoTab day is excluded from totals and named in missing[] (criterion #6)", () => {
    const report = computeGrowthReport({
      locationSlug: "orlando", elapsedDays: 2,
      current: {
        label: "2026-08", courtRows: [],
        gotabDays: [{ date: "2026-08-01", status: "complete", breakdown: { food: 5000 } }, { date: "2026-08-02", status: "open", breakdown: { food: 999999 } }],
        courtreserveOk: true,
      },
      priorMonth: { label: "2026-07", courtRows: [], gotabDays: [], courtreserveOk: true },
      lastYear: { label: "2025-08", courtRows: [], gotabDays: [], courtreserveOk: true },
      rules: growthRules, thresholds: { green_pct: 5, red_pct: -5 }, recognitionThroughDate: "2026-08-02",
    });
    const fb = report.rows.find(r => r.businessLine === "food_beverage")!;
    assert(fb.current === 5000, `open day must be excluded from the total, got ${fb.current}`);
    assert(report.missing.current.some(m => m.includes("2026-08-02")), `expected the open day named in missing[], got ${JSON.stringify(report.missing.current)}`);
  });
  await t("growth-report: alerts fire on EITHER comparison breaching thresholds, never on Gross/Discounts/Total/Unmapped", () => {
    const report = computeGrowthReport({
      locationSlug: "orlando", elapsedDays: 1,
      current: { label: "2026-08", courtRows: [rowsFor("2026-08-01", "Membership Fee", 20000)], gotabDays: [], courtreserveOk: true },
      priorMonth: { label: "2026-07", courtRows: [rowsFor("2026-07-01", "Membership Fee", 10000)], gotabDays: [], courtreserveOk: true },
      lastYear: { label: "2025-08", courtRows: [rowsFor("2025-08-01", "Membership Fee", 20000)], gotabDays: [], courtreserveOk: true },
      rules: growthRules, thresholds: { green_pct: 5, red_pct: -5 }, recognitionThroughDate: "2026-08-01",
    });
    assert(report.alerts.some(a => a.businessLine === "memberships" && a.direction === "up" && a.comparison === "prior_month"), JSON.stringify(report.alerts));
    assert(!report.alerts.some(a => (a.businessLine as string) === "gross_revenues" || (a.businessLine as string) === "total"), "Gross/Total must never alert");
  });
  await t("growth-report: singleDay mode isolates one calendar day, never accumulates from day 1 (drilldown_3_clicks/reads_supabase)", () => {
    const report = computeGrowthReport({
      locationSlug: "orlando", elapsedDays: 15, singleDay: true, currentPhase: "complete",
      current: { label: "2026-08", courtRows: [rowsFor("2026-08-01", "Reservation", 999999), rowsFor("2026-08-15", "Reservation", 5000)], gotabDays: [], courtreserveOk: true },
      priorMonth: { label: "2026-07", courtRows: [rowsFor("2026-07-15", "Reservation", 4000)], gotabDays: [], courtreserveOk: true },
      lastYear: { label: "2025-08", courtRows: [rowsFor("2025-08-15", "Reservation", 3000)], gotabDays: [], courtreserveOk: true },
      rules: growthRules, thresholds: { green_pct: 5, red_pct: -5 }, recognitionThroughDate: "2026-08-15",
    });
    const pickleball = report.rows.find(r => r.businessLine === "pickleball")!;
    assert(pickleball.current === 5000, `singleDay must isolate day 15 only, excluding day 1's 999999, got ${pickleball.current}`);
    assert(pickleball.priorMonth === 4000 && pickleball.lastYear === 3000, JSON.stringify(pickleball));
  });
  await t("growth-report: a fully future period suppresses pct/alerts and states it hasn't started (incomplete_labelled)", () => {
    const report = computeGrowthReport({
      locationSlug: "orlando", elapsedDays: 0, currentPhase: "future",
      current: { label: "2027-01", courtRows: [], gotabDays: [], courtreserveOk: true },
      priorMonth: { label: "2026-12", courtRows: [rowsFor("2026-12-01", "Reservation", 5000)], gotabDays: [], courtreserveOk: true },
      lastYear: { label: "2026-01", courtRows: [rowsFor("2026-01-01", "Reservation", 4000)], gotabDays: [], courtreserveOk: true },
      rules: growthRules, thresholds: { green_pct: 5, red_pct: -5 }, recognitionThroughDate: "2027-01-01",
    });
    const total = report.rows.find(r => r.businessLine === "total")!;
    assert(total.current === 0 && total.vsPriorMonthPct === null && total.vsLastYearPct === null, `future period must never fabricate a pct, got ${JSON.stringify(total)}`);
    assert(report.alerts.length === 0, `future period must never alert, got ${JSON.stringify(report.alerts)}`);
    assert(report.missing.current.some(m => /hasn't started/i.test(m)), `expected a "hasn't started" message, got ${JSON.stringify(report.missing.current)}`);
  });
  await t("growth-report: an in-progress month states elapsed/remaining days but still compares normally (incomplete_labelled)", () => {
    const report = computeGrowthReport({
      locationSlug: "orlando", elapsedDays: 3, currentPhase: "in_progress",
      current: { label: "2026-08", courtRows: [rowsFor("2026-08-01", "Reservation", 6000)], gotabDays: [], courtreserveOk: true },
      priorMonth: { label: "2026-07", courtRows: [rowsFor("2026-07-01", "Reservation", 3000)], gotabDays: [], courtreserveOk: true },
      lastYear: { label: "2025-08", courtRows: [], gotabDays: [], courtreserveOk: true },
      rules: growthRules, thresholds: { green_pct: 5, red_pct: -5 }, recognitionThroughDate: "2026-08-03",
    });
    const pickleball = report.rows.find(r => r.businessLine === "pickleball")!;
    assert(pickleball.vsPriorMonthPct === 100, `in-progress period must still compare normally, got ${pickleball.vsPriorMonthPct}`);
    assert(report.missing.current.some(m => /in progress/i.test(m) && /remaining/i.test(m)), `expected an in-progress/remaining-days message, got ${JSON.stringify(report.missing.current)}`);
  });

  const { buildHourlyCurve } = await import("../packages/skills/growth-report/index");
  await t("growth-report: hourly curve buckets recognized rows by StartDateTime's hour (criterion #7)", () => {
    const withHour = (date: string, hour: string, amountCents: number) => ({ ...rowsFor(date, "Reservation", amountCents), raw: { StartDateTime: `${date}T${hour}:00:00` } });
    const curve = buildHourlyCurve([withHour("2026-08-01", "09", 5000), withHour("2026-08-01", "09", 2000), withHour("2026-08-01", "14", 3000), withHour("2026-08-02", "09", 999999)], "2026-08-01");
    assert(curve.length === 2, JSON.stringify(curve));
    assert(curve[0].hour === 9 && curve[0].amountCents === 7000, JSON.stringify(curve[0]));
    assert(curve[1].hour === 14 && curve[1].amountCents === 3000, JSON.stringify(curve[1]));
  });

  // 9 · reconciliation: recognized vs payment-basis per FeeCategory/TransactionType, with delta (spec section 4)
  const { computeReconciliation } = await import("../packages/skills/reconciliation/index");
  await t("reconciliation: groups by FeeCategory + TransactionType and computes the delta without picking a winner", () => {
    const recognized = [rowsFor("2026-08-01", "Reservation", 15000)];
    const paymentBasis = [{
      locationSlug: "orlando", source: "courtreserve" as const, externalId: "tx1", businessDate: "2026-08-01", occurredAt: "2026-08-01T10:00:00",
      category: "Reservation", itemName: "Indoor Pickleball", quantity: null, grossCents: 10000, discountCents: 0, compCents: 0,
      taxCents: 0, tipCents: 0, netCents: 10000,
      paymentType: "card", channel: null, staffName: null, raw: { TransactionType: null },
    }];
    const rows = computeReconciliation(recognized, paymentBasis);
    assert(rows.length === 1, JSON.stringify(rows));
    assert(rows[0].recognizedCents === 15000 && rows[0].paymentBasisCents === 10000 && rows[0].deltaCents === 5000, JSON.stringify(rows[0]));
  });

  // 10 · knowledge/revenue: recognized-revenue round trip, business_line_map seeds itself,
  // alert dedupe never sends the same (location, line, day) twice (criterion #5)
  const { replaceRecognizedRevenue, readRecognizedRevenue, listBusinessLineRules, tryRecordAlert } = await import("../packages/knowledge/revenue");
  await t("knowledge/revenue: replaceRecognizedRevenue/readRecognizedRevenue round-trips and replaces, never duplicates", async () => {
    await replaceRecognizedRevenue(testLocation, "2026-08-01", "2026-08-01", [rowsFor("2026-08-01", "Reservation", 15000)]);
    let rows = await readRecognizedRevenue(testLocation, "2026-08-01", "2026-08-01");
    assert(rows.length === 1 && rows[0].amountCents === 15000, JSON.stringify(rows));
    await replaceRecognizedRevenue(testLocation, "2026-08-01", "2026-08-01", [rowsFor("2026-08-01", "Reservation", 22000)]);
    rows = await readRecognizedRevenue(testLocation, "2026-08-01", "2026-08-01");
    assert(rows.length === 1 && rows[0].amountCents === 22000, `expected the replace to win, got ${JSON.stringify(rows)}`);
  });
  await t("knowledge/revenue: business_line_map seeds itself from the default rules", async () => {
    const rules = await listBusinessLineRules();
    assert(rules.length > 0, "expected the seeded default rules, got none");
    assert(rules.some(r => r.businessLine === "memberships"), JSON.stringify(rules));
  });
  await t("knowledge/revenue: alert dedupe — the same (location, line, day) never sends twice (criterion #5)", async () => {
    const first = await tryRecordAlert({ locationSlug: testLocation, businessLine: "pickleball", sentOn: "2026-08-01", direction: "up", comparison: "prior_month", pct: 25, message: "test" });
    const second = await tryRecordAlert({ locationSlug: testLocation, businessLine: "pickleball", sentOn: "2026-08-01", direction: "up", comparison: "prior_month", pct: 25, message: "test" });
    assert(first === true && second === false, `expected [true, false], got [${first}, ${second}]`);
  });

  // 10b · lib/format: spec section 8 is literal — "em dash for absent values (never $0.00)"
  // (h_zero_vs_dash)
  const { fmtUsd } = await import("../apps/web/app/lib/format");
  await t("lib/format: fmtUsd never renders $0.00 — zero and absent both render as an em dash (h_zero_vs_dash)", () => {
    assert(fmtUsd(0) === "—", `expected an em dash for zero, got ${fmtUsd(0)}`);
    assert(fmtUsd(null) === "—", `expected an em dash for null, got ${fmtUsd(null)}`);
    assert(fmtUsd(150000) === "$1,500.00", `expected a real amount to still format normally, got ${fmtUsd(150000)}`);
    assert(fmtUsd(-150000) === "($1,500.00)", `expected a negative amount in parentheses, got ${fmtUsd(-150000)}`);
  });

  // 11 · checkpoint fails closed (shared infra — the hard gate any future sensitive action builds on)
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

  // 12 · router: cheapest-capable ladder + escalation (shared infra, no model named outside it)
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

  // 13 · budget policy: notify -> pause -> human approval -> resume (consumed)
  const loopDir = repoPath(".loop");
  await t("budget: past-budget run PAUSES awaiting approval (exit 3)", () => {
    rmSync(`${loopDir}/costs.jsonl`, { force: true });
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
    rmSync(`${loopDir}/costs.jsonl`, { force: true });
  });

  // 14 · live smoke test: the app actually boots and answers real HTTP requests. This runs
  // entirely inside this already-permitted `npm run selftest` process via Node's built-in
  // fetch — no curl/WebFetch/browser-automation tool call is needed to get this evidence,
  // which matters because a tester's sandbox may not have those granted separately.
  const SMOKE_PORT = Number(process.env.SELFTEST_SMOKE_PORT ?? 3000);
  const SMOKE_BASE = `http://127.0.0.1:${SMOKE_PORT}`;
  const fetchWithTimeout = async (path: string, opts: RequestInit = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try { return await fetch(`${SMOKE_BASE}${path}`, { ...opts, signal: controller.signal }); }
    finally { clearTimeout(timer); }
  };
  const isUp = async () => { try { return (await fetchWithTimeout("/login")).status < 500; } catch { return false; } };
  const waitUntilUp = async (timeoutMs: number) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await isUp()) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`server did not respond on ${SMOKE_BASE} within ${timeoutMs}ms`);
  };

  let smokeServer: ChildProcess | null = null;
  try {
    if (!(await isUp())) {
      smokeServer = spawn("npm", ["run", "dev", "--workspace", "web"], {
        cwd: repoPath("."),
        env: { ...process.env, PORT: String(SMOKE_PORT) },
        stdio: "ignore",
      });
      await waitUntilUp(90_000);
    }

    await t("live smoke: /login serves the sign-in page over real HTTP", async () => {
      const r = await fetchWithTimeout("/login");
      const body = await r.text();
      assert(r.status === 200, `expected 200, got ${r.status}`);
      assert(body.includes("Sign in") && body.includes("CY360 Sales"), "login page missing expected copy");
    });
    await t("live smoke: /admin/login serves the admin sign-in page", async () => {
      const r = await fetchWithTimeout("/admin/login");
      const body = await r.text();
      assert(r.status === 200, `expected 200, got ${r.status}`);
      assert(body.includes("Admin") && body.includes("Sign in"), "admin login page missing expected copy");
    });
    await t("live smoke: / redirects an anonymous visitor to /login, never 500s", async () => {
      const r = await fetchWithTimeout("/", { redirect: "follow" });
      assert(r.status === 200, `expected 200 after redirect, got ${r.status}`);
      assert(r.url.endsWith("/login"), `expected to land on /login, got ${r.url}`);
    });
    await t("live smoke: an unknown route renders the branded 404, not a stack trace", async () => {
      const r = await fetchWithTimeout("/this-route-does-not-exist");
      const body = await r.text();
      assert(r.status === 404, `expected 404, got ${r.status}`);
      console.log("DEBUG404", body.slice(0, 2000));
      assert(!/Internal Server Error|at Object\.|node_modules\//.test(body), "leaked a stack trace to the user");
    });
  } finally {
    if (smokeServer) smokeServer.kill("SIGTERM");
  }

  rmSync(repoPath(".local-storage", "warehouse", testLocation), { recursive: true, force: true });

  console.log(`\n  ${pass} passed · ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}
main();
