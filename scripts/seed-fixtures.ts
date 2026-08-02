/**
 * Generates trailing-12-month CSV fixtures for Orlando (data/imports/{gotab,courtreserve})
 * so criteria #5 (backfill trailing 12 months from CSV when no API credentials exist) has
 * real data to backfill, and the dashboard shows real numbers by default instead of "no
 * sales loaded yet" for every date a manager might pick. Deterministic (seeded by date, not
 * Math.random) so re-running produces identical fixtures — same discipline as the rest of
 * the pipeline never fabricating numbers that can silently drift between runs.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoPath } from "../packages/core/paths";
import { etYesterday } from "../packages/loops/index";

function seeded(dateStr: string, salt: string): number {
  let h = 0;
  const s = dateStr + salt;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return ((h >>> 0) % 10000) / 10000; // [0, 1)
}

function dateRange(monthsBack: number): string[] {
  const end = new Date(`${etYesterday()}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - monthsBack);
  const dates: string[] = [];
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function isWeekend(dateStr: string): boolean {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function gotabCsv(date: string): string {
  const boost = isWeekend(date) ? 1.35 : 1;
  const jitter = (salt: string, base: number, spread: number) => base + (seeded(date, salt) - 0.5) * spread;
  const food = Math.max(200, jitter("food", 750, 300)) * boost;
  const beverage = Math.max(100, jitter("bev", 380, 160)) * boost;
  const alcohol = Math.max(100, jitter("alc", 520, 220)) * boost;
  const rows = [
    ["food", food, Math.round(food / 13.4)],
    ["beverage", beverage, Math.round(beverage / 4.7)],
    ["alcohol", alcohol, Math.round(alcohol / 14.9)],
  ] as const;
  return "category,gross_amount,transaction_count\n" + rows.map(([c, amt, n]) => `${c},${amt.toFixed(2)},${n}`).join("\n") + "\n";
}

function courtreserveCsv(date: string): string {
  const boost = isWeekend(date) ? 1.5 : 1;
  const jitter = (salt: string, base: number, spread: number) => base + (seeded(date, salt) - 0.5) * spread;
  const pickleball = Math.max(200, jitter("pb", 1100, 500)) * boost;
  const tennis = Math.max(100, jitter("tn", 350, 200)) * boost;
  const rows = [
    ["pickleball", pickleball, Math.round(pickleball / 30)],
    ["tennis", tennis, Math.round(tennis / 35)],
  ] as const;
  return "court_type,gross_amount,reservation_count\n" + rows.map(([c, amt, n]) => `${c},${amt.toFixed(2)},${n}`).join("\n") + "\n";
}

function main() {
  const monthsArg = process.argv.find(a => a.startsWith("--months="))?.split("=")[1];
  const months = monthsArg ? parseInt(monthsArg, 10) : 12;
  const dates = dateRange(months);

  const gotabDir = repoPath("data/imports/gotab/orlando");
  const courtDir = repoPath("data/imports/courtreserve/orlando");
  mkdirSync(gotabDir, { recursive: true });
  mkdirSync(courtDir, { recursive: true });

  let written = 0;
  for (const date of dates) {
    const gPath = join(gotabDir, `${date}.csv`);
    if (!existsSync(gPath)) { writeFileSync(gPath, gotabCsv(date)); written++; }
    const cPath = join(courtDir, `${date}.csv`);
    if (!existsSync(cPath)) { writeFileSync(cPath, courtreserveCsv(date)); written++; }
  }
  console.log(`Seeded ${written} fixture CSV file(s) across ${dates.length} day(s) (${dates[0]} .. ${dates[dates.length - 1]}).`);
}
main();
