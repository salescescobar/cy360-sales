import { readdirSync, readFileSync, existsSync } from "node:fs";
if (!existsSync(".loop")) { console.log("No runs yet. Start with: npm run loop:dry"); process.exit(0); }
const files = readdirSync(".loop").filter(f => f.endsWith(".json")).sort().slice(-5);
if (!files.length) { console.log("No runs yet. Start with: npm run loop:dry"); process.exit(0); }
for (const f of files) {
  const r = JSON.parse(readFileSync(`.loop/${f}`, "utf8"));
  const ok = r.results.filter((x: any) => x.status === "ok").length;
  console.log(`${r.when}  ${r.dryRun ? "dry" : "run"}  ${ok}/${r.results.length} steps live  → ${r.results.at(-1).detail}`);
}
