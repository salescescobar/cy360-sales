/** C · Cost per task class, from .loop/costs.jsonl — the CEO number for model spend. */
import { readFileSync, existsSync } from "node:fs";
if (!existsSync(".loop/costs.jsonl")) { console.log("No model calls logged yet."); process.exit(0); }
const rows = readFileSync(".loop/costs.jsonl", "utf8").trim().split("\n").map(l => JSON.parse(l));
const by: Record<string, { calls: number; usd: number; escalated: number }> = {};
for (const r of rows) {
  by[r.task] ??= { calls: 0, usd: 0, escalated: 0 };
  by[r.task].calls++; by[r.task].usd += r.usd; if (r.rung !== "cheap" && ["classify","extract","format","summarize"].includes(r.task)) by[r.task].escalated++;
}
console.log("task class      calls   usd      escalations");
for (const [k, v] of Object.entries(by)) console.log(`${k.padEnd(15)} ${String(v.calls).padStart(5)}   $${v.usd.toFixed(4).padStart(7)}   ${v.escalated}`);
console.log(`TOTAL           ${String(rows.length).padStart(5)}   $${rows.reduce((a, r) => a + r.usd, 0).toFixed(4).padStart(7)}`);
