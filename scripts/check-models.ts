/**
 * Model verifier — the ONLY sanctioned way to adopt a new model.
 * Queries Anthropic's live /v1/models with YOUR key and checks the config ladder
 * against reality. No model enters the router without appearing here first:
 * third-party catalogs and news posts don't count; the API does.
 * Adopting a newer model (e.g. a future opus-5): run this, see it listed,
 * verify pricing on anthropic.com/pricing, edit ONE line in config.yaml, commit.
 */
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const cfg = (parse(readFileSync("config.yaml", "utf8")) as { models: Record<string, unknown> }).models as {
  cheap: string; mid: string; top: string; frontier?: string;
};
const ladder: Array<[string, string]> = [["cheap", cfg.cheap], ["mid", cfg.mid], ["top", cfg.top]];
if (cfg.frontier) ladder.push(["frontier", cfg.frontier]);

async function main() {
  const key = process.env.ANTHROPIC_API_KEY;
  console.log("\n▶ Router ladder in config.yaml:");
  for (const [r, m] of ladder) console.log(`   ${r.padEnd(8)} ${m}`);
  if (!key) {
    console.log("\nNo ANTHROPIC_API_KEY set — can't query the live model list.");
    console.log("Set the key and re-run to verify these strings against /v1/models.\n");
    return;
  }
  const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
  });
  if (!res.ok) throw new Error(`models list failed (${res.status}): ${await res.text()}`);
  const ids = ((await res.json()) as { data: Array<{ id: string }> }).data.map(d => d.id);

  console.log(`\n▶ Live models available to THIS key (${ids.length}):`);
  for (const id of ids) console.log(`   ${id}`);

  let bad = 0;
  console.log("\n▶ Ladder check:");
  for (const [rung, m] of ladder) {
    const exact = ids.includes(m);
    const dated = ids.find(id => id.startsWith(m + "-"));
    if (exact) console.log(`   ✓ ${rung}: ${m}`);
    else if (dated) console.log(`   ~ ${rung}: ${m} not exact — dated variant exists: ${dated} (alias likely fine; pin the dated string if calls fail)`);
    else { console.log(`   ✗ ${rung}: ${m} NOT AVAILABLE to this key — fix config.yaml before running the loop`); bad++; }
  }
  const known = new Set(ladder.map(l => l[1]));
  const candidates = ids.filter(id => /^claude-(opus|sonnet|haiku|fable|mythos)/.test(id) && ![...known].some(k => id.startsWith(k)));
  if (candidates.length) {
    console.log("\n▶ Models available but not in your ladder (evaluate before adopting — verify price first):");
    for (const c of candidates) console.log(`   · ${c}`);
  }
  console.log(bad ? "\n✗ Ladder has unavailable models.\n" : "\n✓ Ladder verified against the live API.\n");
  process.exit(bad ? 2 : 0);
}
main().catch(e => { console.error("check failed:", e); process.exit(1); });
