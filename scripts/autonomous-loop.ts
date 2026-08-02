/**
 * Autonomous Product Loop — engine v1 (orchestrator).
 * Builder and Judge run as SEPARATE executions with separate inputs:
 * the builder sees the spec + last failure report; the judge sees the rubric + the preview.
 * Verified control flow: iteration caps, budget kill-switch, holdout rotation,
 * stuck-escalation, security/cost blockers, honest exits. Executors are pluggable:
 *   --simulate            deterministic run (verifies the engine itself)
 *   --simulate=stuck      verifies the stuck-escalation path
 *   --executor=claude-code  spawns `claude -p` per role (requires signed-in Claude Code)
 */
import { readFileSync, existsSync, mkdirSync, appendFileSync, renameSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import { parse } from "yaml";
import { loadLocalEnv } from "../packages/core/env";
loadLocalEnv();

type Check = { id: string; blocker?: boolean; desc: string };
type Rubric = { threshold: number; core: Check[]; holdout_pool: Check[] };
type Report = { score: number; blockers: string[]; failures: Array<{ id: string; desc: string; evidence: string }> };

const args = process.argv.slice(2);
const simulate = args.find(a => a.startsWith("--simulate"));
const stuck = simulate === "--simulate=stuck";
const executor = args.find(a => a.startsWith("--executor="))?.split("=")[1] ?? (simulate ? "simulate" : "claude-code");

const cfg = parse(readFileSync("config.yaml", "utf8")) as {
  autonomous_build: { enabled: boolean; max_iterations: number; budget_usd: number; budget_alert_pct?: number; gate_threshold: number; holdout_checks: number; escalate_if_stuck_at: number };
  alerts?: { slack_channel?: string };
};
const ab = cfg.autonomous_build;
if (!ab?.enabled) { console.log("autonomous_build.enabled is false."); process.exit(0); }
const rubric = parse(readFileSync("tests/rubric/functional-gate.yaml", "utf8")) as Rubric;

const trace = (o: object) => { mkdirSync(".loop", { recursive: true }); appendFileSync(".loop/autonomous.jsonl", JSON.stringify({ at: new Date().toISOString(), ...o }) + "\n"); };
const slack = async (text: string) => { const h = process.env.SLACK_WEBHOOK_URL; if (h) await fetch(h, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => undefined); };

function pickHoldouts(iter: number): Check[] {
  const n = ab.holdout_checks ?? 3, pool = rubric.holdout_pool;
  return Array.from({ length: n }, (_, i) => pool[((iter - 1) + i * 2) % pool.length]); // rotates per iteration, never repeats within one
}

function securityBlocker(): string | null {
  try { execSync("npm audit --omit=dev --audit-level=high", { stdio: "ignore" }); } catch { return "security_gate: npm audit found high vulns"; }
  try {
    const hits = execSync(`grep -rInE "(DROP +TABLE|TRUNCATE |rm +-rf|\\.delete\\(|deleteMany|destroy\\()" --include=*.ts --include=*.tsx --exclude-dir=node_modules --exclude-dir=.next packages apps scripts 2>/dev/null | grep -v requireCheckpoint || true`).toString().trim();
    if (hits) return "security_gate: destructive op without requireCheckpoint()";
  } catch { /* grep exit codes are fine */ }
  return null;
}
function spentUsd(): number {
  if (!existsSync(".loop/costs.jsonl")) return 0;
  return readFileSync(".loop/costs.jsonl", "utf8").trim().split("\n").filter(Boolean).reduce((a, l) => a + (JSON.parse(l).usd ?? 0), 0);
}

// ---- pluggable executors -------------------------------------------------
async function builderRun(iter: number, spec: string, failures: Report | null): Promise<void> {
  if (executor === "simulate") return; // simulated builder "works" instantly
  const prompt = `You are the BUILDER. Spec:\n${spec}\n\n${failures ? `Fix ONLY these failures:\n${failures.failures.map(f => `- ${f.id}: ${f.desc} (${f.evidence})`).join("\n")}` : "Implement the spec."}\nFollow CLAUDE.md. Commit when done.`;
  execFileSync("claude", ["-p", prompt, "--permission-mode", "acceptEdits"], { stdio: "inherit" });
}
async function judgeRun(iter: number, checks: Check[]): Promise<Report> {
  if (executor === "simulate") {
    const score = stuck ? [86, 87, 86, 87, 86][Math.min(iter - 1, 4)] : [62, 78, 91][Math.min(iter - 1, 2)];
    const pass = score >= (ab.gate_threshold ?? rubric.threshold);
    return { score, blockers: [], failures: pass ? [] : checks.slice(0, 2).map(c => ({ id: c.id, desc: c.desc, evidence: "simulated failure evidence" })) };
  }
  const prompt = `You are the JUDGE. Use the product at the preview URL like a real user (browser). Never read code. Score /100 against:\n${checks.map(c => `- [${c.blocker ? "BLOCKER" : "minor"}] ${c.id}: ${c.desc}`).join("\n")}\nReturn JSON {score, blockers[], failures:[{id,desc,evidence}]} with screenshot/log evidence per failure.`;
  const out = execFileSync("claude", ["-p", prompt, "--output-format", "json"], { stdio: ["ignore", "pipe", "inherit"] }).toString();
  return JSON.parse(out) as Report;
}
// --------------------------------------------------------------------------

let budgetAlerted = false;
let budgetWaived = false;
function humanApprovalAvailable(): boolean {
  if (process.env.AILABS_APPROVAL_TOKEN) return true;               // explicit per-invocation resume
  if (existsSync(".loop/budget-approved")) {                        // one-shot file, consumed on use
    renameSync(".loop/budget-approved", `.loop/budget-approved.used-${Date.now()}`);
    return true;
  }
  return false;
}

async function main() {
  const spec = existsSync("docs/spec.md") ? readFileSync("docs/spec.md", "utf8") : "(spec issue #1 — paste or link it in docs/spec.md for unattended runs)";
  console.log(`\n▶ Autonomous loop — executor: ${executor} · gate ≥${ab.gate_threshold} · caps: ${ab.max_iterations} iters / $${ab.budget_usd}`);
  let report: Report | null = null;
  let nearMisses = 0;

  for (let iter = 1; iter <= ab.max_iterations; iter++) {
    const spent = spentUsd();
    const alertAt = ab.budget_usd * ((ab.budget_alert_pct ?? 80) / 100);
    if (!budgetAlerted && spent >= alertAt) {
      budgetAlerted = true;
      console.log(`  ⚠ spend at ${Math.round((spent / ab.budget_usd) * 100)}% of budget ($${spent.toFixed(2)} / $${ab.budget_usd}) — still running`);
      await slack(`⚠ Autonomous loop: spend at $${spent.toFixed(2)} of $${ab.budget_usd} budget — still running.`);
    }
    if (!budgetWaived && spent > ab.budget_usd) {
      if (humanApprovalAvailable()) {
        budgetWaived = true;
        console.log(`  ✅ human approved continuing past budget for this run ($${spent.toFixed(2)} spent)`);
        await slack(`✅ Human approved: loop continues past budget for this run ($${spent.toFixed(2)} spent). Every call stays logged.`);
        trace({ budgetWaived: true, spentUsd: spent });
      } else {
        console.log(`\n🛑 PAUSED — run cost $${spent.toFixed(2)} exceeded the $${ab.budget_usd} budget.`);
        console.log(`   Nothing was lost: every iteration is committed. To approve continuing:`);
        console.log(`   touch .loop/budget-approved   (or set AILABS_APPROVAL_TOKEN) and re-run the same command.`);
        await slack(`🛑 Autonomous loop PAUSED awaiting your approval: cost $${spent.toFixed(2)} > $${ab.budget_usd} budget. Approve with .loop/budget-approved and re-run.`);
        trace({ pausedAwaitingApproval: true, spentUsd: spent });
        process.exit(3);
      }
    }

    await builderRun(iter, spec, report);
    const checks = [...rubric.core, ...pickHoldouts(iter)];
    report = await judgeRun(iter, checks);

    const sec = securityBlocker();
    if (sec) report.blockers.push(sec);
    if (!budgetWaived && spent > ab.budget_usd) report.blockers.push(`cost_gate: $${spent.toFixed(2)} > $${ab.budget_usd}`);

    const holdoutIds = pickHoldouts(iter).map(h => h.id).join(",");
    console.log(`  iter ${iter}: score ${report.score} · blockers ${report.blockers.length} · holdouts [${holdoutIds}] · spent $${spent.toFixed(2)}`);
    trace({ iter, score: report.score, blockers: report.blockers, holdouts: holdoutIds, spentUsd: spent });
    try { execSync(`git add -A && git commit -qm "loop-iter-${iter}: score ${report.score}"`, { stdio: "ignore" }); } catch { /* not a repo yet is fine */ }

    if (report.score >= ab.gate_threshold && report.blockers.length === 0) {
      console.log(`\n✅ GATE PASSED at iteration ${iter}. Deploy stays PREVIEW — production promotion needs the 6-point human review.`);
      await slack(`✅ Autonomous loop passed the gate (score ${report.score}, iter ${iter}). Awaiting human promotion to production.`);
      trace({ done: true, iter, score: report.score });
      return;
    }
    nearMisses = ab.gate_threshold - report.score <= 5 ? nearMisses + 1 : 0;
    if (nearMisses >= (ab.escalate_if_stuck_at ?? 3)) { await escalate(`stuck near the gate ${nearMisses} rounds (score ${report.score}) — the spec is likely ambiguous`, report); return; }
  }
  await escalate(`max iterations (${ab.max_iterations}) reached`, report);

  async function escalate(reason: string, r: Report | null) {
    console.log(`\n⚠ ESCALATION: ${reason}. Honest state report follows — NO false victory.`);
    if (r) console.log(`  last score ${r.score}; open failures: ${r.failures.map(f => f.id).join(", ") || "none"}`);
    await slack(`⚠ Autonomous loop escalated: ${reason}`);
    trace({ escalated: reason, lastScore: r?.score ?? null });
    process.exit(2);
  }
}
main().catch(e => { console.error("engine error:", e); process.exit(1); });
