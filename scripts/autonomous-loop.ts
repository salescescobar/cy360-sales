/**
 * Autonomous Product Loop — engine v2 (orchestrator).
 * Builder and Judge run as SEPARATE executions with separate inputs:
 * the builder sees the spec + last failure report; the judge sees the rubric + a running app.
 * v2 closes the defects the first real run exposed: preflight, live output + heartbeat,
 * a locally served product to judge, and a verdict parser that never crashes the run.
 *   --simulate            deterministic run (verifies the engine itself)
 *   --simulate=stuck      verifies the stuck-escalation path
 *   --executor=claude-code  spawns `claude -p` per role (requires signed-in Claude Code)
 */
import { readFileSync, existsSync, mkdirSync, appendFileSync, renameSync, writeFileSync } from "node:fs";
import { execSync, spawn, spawnSync } from "node:child_process";
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
};
const ab = cfg.autonomous_build;
if (!ab?.enabled) { console.log("autonomous_build.enabled is false."); process.exit(0); }
const rubric = parse(readFileSync("tests/rubric/functional-gate.yaml", "utf8")) as Rubric;

const trace = (o: object) => { mkdirSync(".loop", { recursive: true }); appendFileSync(".loop/autonomous.jsonl", JSON.stringify({ at: new Date().toISOString(), ...o }) + "\n"); };
const slack = async (text: string) => { const h = process.env.SLACK_WEBHOOK_URL; if (h) await fetch(h, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => undefined); };

function pickHoldouts(iter: number): Check[] {
  const n = ab.holdout_checks ?? 3, pool = rubric.holdout_pool;
  return Array.from({ length: n }, (_, i) => pool[((iter - 1) + i * 2) % pool.length]);
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

/**
 * Claude Code must authenticate with the SEAT (subscription), not with our API key:
 * if ANTHROPIC_API_KEY reaches the CLI it bills API credits instead of the plan.
 */
function claudeEnv(): NodeJS.ProcessEnv {
  const e = { ...process.env };
  delete e.ANTHROPIC_API_KEY;
  delete e.ANTHROPIC_AUTH_TOKEN;
  return e;
}

/** Fail fast and loudly if the executor isn't usable — an unattended run must never hang. */
function preflight() {
  if (executor !== "claude-code") return;
  const r = spawnSync("claude", ["--version"], { env: claudeEnv(), encoding: "utf8" });
  if (r.status !== 0) {
    console.error("✗ preflight: `claude` CLI not usable.\n" + (r.stderr || r.error?.message || "unknown"));
    console.error("  Fix: npm i -g @anthropic-ai/claude-code && claude   (sign in, then /exit)");
    process.exit(4);
  }
  console.log(`  executor: claude ${r.stdout.trim()} (seat auth, API key withheld)`);
}

/** Live output: tees to console and .loop/<role>-<iter>.log, with a heartbeat. */
function runClaude(role: string, iter: number, cliArgs: string[]): Promise<{ code: number; out: string }> {
  mkdirSync(".loop", { recursive: true });
  const logPath = `.loop/${role}-${iter}.log`;
  writeFileSync(logPath, "");
  const started = Date.now();
  console.log(`  ▸ ${role} iter ${iter} started — live log: ${logPath}`);
  const beat = setInterval(() => {
    console.log(`    …${role} still working (${Math.round((Date.now() - started) / 60000)} min)`);
  }, 30000);

  return new Promise(resolve => {
    const child = spawn("claude", cliArgs, { env: claudeEnv(), stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const tee = (buf: Buffer) => {
      const t = buf.toString(); out += t; process.stdout.write(t);
      try { appendFileSync(logPath, t); }
      catch { try { mkdirSync(".loop", { recursive: true }); appendFileSync(logPath, t); } catch { /* logging must never crash a build */ } }
    };
    child.stdout.on("data", tee);
    child.stderr.on("data", tee);
    child.on("error", err => { clearInterval(beat); resolve({ code: 127, out: out + String(err) }); });
    child.on("close", code => {
      clearInterval(beat);
      console.log(`  ▸ ${role} iter ${iter} finished in ${Math.round((Date.now() - started) / 1000)}s (exit ${code ?? 0})`);
      resolve({ code: code ?? 0, out });
    });
  });
}

/** The judge tests a RUNNING app. Build + serve locally: no cloud preview needed to gate. */
async function withLocalServer<T>(fn: (url: string) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; reason: string }> {
  const build = spawnSync("npm", ["run", "build", "-w", "web"], { encoding: "utf8" });
  if (build.status !== 0) return { ok: false, reason: `build failed:\n${(build.stdout || "").slice(-1500)}${(build.stderr || "").slice(-800)}` };
  const server = spawn("npm", ["run", "start", "-w", "web"], { stdio: "ignore", detached: true });
  const url = "http://localhost:3000";
  try {
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 500));
      try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
      if (i === 39) return { ok: false, reason: "app did not answer on localhost:3000 within 20s" };
    }
    return { ok: true, value: await fn(url) };
  } finally {
    try { process.kill(-server.pid!, "SIGKILL"); } catch { /* already gone */ }
  }
}

const firstJsonObject = (t: string): string | null => {
  const i = t.indexOf("{");
  if (i < 0) return null;
  let d = 0;
  for (let j = i; j < t.length; j++) {
    if (t[j] === "{") d++;
    else if (t[j] === "}" && --d === 0) return t.slice(i, j + 1);
  }
  return null;
};

async function builderRun(iter: number, spec: string, failures: Report | null): Promise<void> {
  if (executor === "simulate") return;
  const prompt = `You are the BUILDER working UNATTENDED. Spec:\n${spec}\n\n${failures
    ? `Fix ONLY these failures:\n${failures.failures.map(f => `- ${f.id}: ${f.desc} (${f.evidence})`).join("\n")}`
    : "Implement the spec."}

Rules: follow CLAUDE.md · no model name outside packages/core/router.ts · no destructive op
without requireCheckpoint() · each skill needs the named test from the spec · keep
\`npx tsc --noEmit\` and \`npm run selftest\` green · never ask questions, decide and proceed ·
\`git add -A && git commit\` your work when done.`;
  const r = await runClaude("builder", iter, ["-p", prompt, "--permission-mode", "acceptEdits", "--verbose"]);
  if (r.code !== 0) throw new Error(`builder exited ${r.code}. Last output:\n${r.out.slice(-1200) || "(see .loop/builder-" + iter + ".log)"}`);
}

async function judgeRun(iter: number, checks: Check[]): Promise<Report> {
  if (executor === "simulate") {
    const score = stuck ? [86, 87, 86, 87, 86][Math.min(iter - 1, 4)] : [62, 78, 91][Math.min(iter - 1, 2)];
    const pass = score >= (ab.gate_threshold ?? rubric.threshold);
    return { score, blockers: [], failures: pass ? [] : checks.slice(0, 2).map(c => ({ id: c.id, desc: c.desc, evidence: "simulated failure evidence" })) };
  }
  const served = await withLocalServer(async (url) => {
    const prompt = `You are the JUDGE working UNATTENDED. The product runs at ${url}.
Exercise it like a real user with Playwright (npx playwright is installed): navigate, click,
submit, reload. NEVER read the source code — judge only observable behavior.
Score /100 against these checks:
${checks.map(c => `- [${c.blocker ? "BLOCKER" : "minor"}] ${c.id}: ${c.desc}`).join("\n")}
Output ONLY one JSON object, no prose:
{"score":<0-100>,"blockers":["..."],"failures":[{"id":"...","desc":"...","evidence":"what you observed"}]}`;
    return runClaude("judge", iter, ["-p", prompt, "--permission-mode", "acceptEdits"]);
  });

  if (!served.ok) {
    return { score: 0, blockers: [`app_not_serving: ${served.reason.split("\n")[0]}`],
             failures: [{ id: "loads_fast", desc: "App must build and serve", evidence: served.reason.slice(0, 900) }] };
  }
  const json = firstJsonObject(served.value.out);
  if (!json) {
    return { score: 0, blockers: ["judge_output_unparseable"],
             failures: [{ id: "main_flow", desc: "Judge returned no JSON verdict", evidence: served.value.out.slice(-900) }] };
  }
  try {
    const parsed = JSON.parse(json) as Partial<Report>;
    return { score: Number(parsed.score ?? 0), blockers: parsed.blockers ?? [], failures: parsed.failures ?? [] };
  } catch (e) {
    return { score: 0, blockers: ["judge_output_unparseable"],
             failures: [{ id: "main_flow", desc: String(e), evidence: json.slice(0, 900) }] };
  }
}

let budgetAlerted = false;
let budgetWaived = false;
function humanApprovalAvailable(): boolean {
  if (process.env.AILABS_APPROVAL_TOKEN) return true;
  if (existsSync(".loop/budget-approved")) {
    renameSync(".loop/budget-approved", `.loop/budget-approved.used-${Date.now()}`);
    return true;
  }
  return false;
}

async function main() {
  preflight();
  const spec = existsSync("docs/spec.md") ? readFileSync("docs/spec.md", "utf8") : "(paste the approved spec into docs/spec.md for unattended runs)";
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
        trace({ budgetWaived: true, spentUsd: spent });
      } else {
        console.log(`\n🛑 PAUSED — run cost $${spent.toFixed(2)} exceeded the $${ab.budget_usd} budget.`);
        console.log(`   Every iteration is committed. To approve continuing:`);
        console.log(`   touch .loop/budget-approved   and re-run the same command.`);
        await slack(`🛑 Autonomous loop PAUSED awaiting approval: $${spent.toFixed(2)} > $${ab.budget_usd}.`);
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
    try { execSync(`git add -A && git commit -qm "loop-iter-${iter}: score ${report.score}"`, { stdio: "ignore" }); } catch { /* fine */ }

    if (report.score >= ab.gate_threshold && report.blockers.length === 0) {
      console.log(`\n✅ GATE PASSED at iteration ${iter}. Deploy stays PREVIEW — production needs the 6-point human review.`);
      await slack(`✅ Autonomous loop passed the gate (score ${report.score}, iter ${iter}).`);
      trace({ done: true, iter, score: report.score });
      return;
    }
    nearMisses = ab.gate_threshold - report.score <= 5 ? nearMisses + 1 : 0;
    if (nearMisses >= (ab.escalate_if_stuck_at ?? 3)) { await escalate(`stuck near the gate ${nearMisses} rounds (score ${report.score}) — the spec is likely ambiguous`, report); return; }
  }
  await escalate(`max iterations (${ab.max_iterations}) reached`, report);

  async function escalate(reason: string, r: Report | null) {
    console.log(`\n⚠ ESCALATION: ${reason}. Honest state report — NO false victory.`);
    if (r) console.log(`  last score ${r.score}; open failures: ${r.failures.map(f => f.id).join(", ") || "none"}`);
    await slack(`⚠ Autonomous loop escalated: ${reason}`);
    trace({ escalated: reason, lastScore: r?.score ?? null });
    process.exit(2);
  }
}
main().catch(e => { console.error("engine error:", e); process.exit(1); });
