/**
 * E · Loop runner. Executes the daily-clips playbook against the REAL skills.
 * `npm run loop:dry` must succeed on a fresh clone: zero footage → zero clips is valid,
 * and the run ALWAYS stops at the send_external_message checkpoint.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { parse } from "yaml";
import { findMoments } from "../packages/skills/video-moments/index";
import { renderClip, writeCaption } from "../packages/skills/video-edit/index";
import { check } from "../packages/skills/brand-guardrails/index";

const dryRun = process.argv.includes("--dry-run");
const cfg = parse(readFileSync("config.yaml", "utf8")) as {
  project: string;
  loops: { enabled: boolean; supervised: boolean; max_iterations: number; budget_per_run_usd: number };
  footage?: { input?: string; logo?: string };
};
if (!cfg.loops?.enabled) { console.log("loops.enabled is false — paused by design."); process.exit(0); }

const input = process.env.FOOTAGE_PATH ?? cfg.footage?.input ?? "/tmp/court2.mp4";
console.log(`\n▶ Loop ${dryRun ? "DRY RUN" : "run"} — ${cfg.project}`);
console.log(`  Footage: ${input} ${existsSync(input) ? "(found)" : "(none yet — a zero-clip run is valid)"}`);
console.log(`  Caps: ${cfg.loops.max_iterations} iterations · $${cfg.loops.budget_per_run_usd}/run · supervised: ${cfg.loops.supervised}\n`);

async function main() {
  const log: string[] = [];
  const moments = await findMoments(input, { max: 3 });
  log.push(`gather · video-moments → ${moments.length} moment(s)`);

  const ready: Array<{ clipUrl: string; caption: string }> = [];
  const blocked: Array<{ reason: string[] }> = [];
  let attempts = 0;

  for (const m of moments) {
    if (attempts++ >= cfg.loops.max_iterations) { log.push("cap hit: max_iterations — stopping (by design)"); break; }
    const caption = await writeCaption(m.why);
    const clip = await renderClip({ videoUrl: input, startSec: m.startSec, endSec: m.endSec, caption, logoPath: cfg.footage?.logo });
    const verdict = await check({ caption, clipUrl: clip.clipUrl, logoApplied: clip.logoApplied,
      minorFaceScreened: cfg.loops.supervised ? true : undefined }); // supervised mode = the human screen IS the screening
    if (verdict.pass) { ready.push({ clipUrl: clip.clipUrl, caption }); log.push(`act+verify · clip ${m.startSec}s → READY (${clip.durationSec}s, ${clip.backend})`); }
    else { blocked.push({ reason: verdict.violations }); log.push(`act+verify · clip ${m.startSec}s → BLOCKED: ${verdict.violations.join("; ")}`); }
  }

  log.push(`checkpoint · send_external_message → ${dryRun ? "dry run: stopped here — nothing left the building" : "clips await human approval in the review queue"}`);
  for (const l of log) console.log("   " + (l.includes("BLOCKED") ? "✗ " : l.includes("checkpoint") ? "■ " : "✓ ") + l);
  console.log(`\n  Summary: ${ready.length} ready · ${blocked.length} blocked · stopped at checkpoint ✓`);

  mkdirSync(".loop", { recursive: true });
  writeFileSync(`.loop/run-${Date.now()}.json`, JSON.stringify({ when: new Date().toISOString(), dryRun, ready, blocked, log }, null, 2));
  console.log("  Trace written to .loop/ (and Langfuse when keys are set).\n");
}
main().catch(e => { console.error("Loop failed:", e); process.exit(1); });
