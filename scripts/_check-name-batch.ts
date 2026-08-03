import { loadLocalEnv } from "../packages/core/env";
loadLocalEnv();
import { fetchRevenueRecognitionRows } from "../packages/skills/courtreserve-ingest/index";

async function main() {
  const month = process.argv[2] ?? "2025-08";
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const rows = await fetchRevenueRecognitionRows(start, end);
  console.log(`rows: ${rows.length}`);
  const names = new Set<string>();
  for (const r of rows) {
    if (r.MemberFirstName) names.add(r.MemberFirstName.trim());
    if (r.MemberLastName) names.add(r.MemberLastName.trim());
  }
  console.log("has 'Evan' as a first/last name in batch:", names.has("Evan"));
  console.log("has 'Addington' as a first/last name in batch:", names.has("Addington"));
  const miscRow = rows.find(r => r.Description?.includes("Private drop in group for local HOA"));
  console.log("misc row MemberFirstName/LastName:", miscRow?.MemberFirstName, miscRow?.MemberLastName);
  const classRow = rows.find(r => r.Description?.includes("Two-Handed Backhand with Evan Addington"));
  console.log("class row MemberFirstName/LastName:", classRow?.MemberFirstName, classRow?.MemberLastName, "| FeeCategory:", classRow?.FeeCategory);
}
main().catch(e => { console.error(e); process.exit(1); });
