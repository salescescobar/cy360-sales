import { loadLocalEnv } from "../packages/core/env";
loadLocalEnv();
import { ingestRecognizedRevenue, type RecognitionConfig } from "../packages/skills/courtreserve-ingest/index";
import { replaceRecognizedRevenue } from "../packages/knowledge/revenue";

function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const [toY, toM] = to.slice(0, 7).split("-").map(Number);
  while (y < toY || (y === toY && m <= toM)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}
function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

async function main() {
  const cfg: RecognitionConfig = { taxIncluded: false, dedupePackages: true };
  const from = "2025-01-01";
  const to = "2026-08-02";
  for (const month of monthsBetween(from, to)) {
    const monthStart = month === from.slice(0, 7) ? from : `${month}-01`;
    const monthEnd = month === to.slice(0, 7) ? to : lastDayOfMonth(month);
    const recognized = await ingestRecognizedRevenue("orlando", monthStart, monthEnd, cfg);
    await replaceRecognizedRevenue("orlando", monthStart, monthEnd, recognized);
    console.log(`${month}: ${recognized.length} recognized row(s)`);
  }
  console.log("done");
}
main().catch(e => { console.error("diag failed:", e); process.exit(1); });
