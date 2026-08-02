/**
 * Self-test: the template proves ITSELF before any product is built on it.
 * Runs locally and in CI. Every claim in the deck maps to an assertion here.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let pass = 0, fail = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try { await fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.log(`  ✗ ${name} — ${(e as Error).message}`); fail++; }
}
const assert = (c: unknown, msg: string) => { if (!c) throw new Error(msg); };

async function main() {
  console.log("\n▶ Template self-test\n");

  // 1 · checkpoint fails closed
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
  await t("checkpoint: dry run never approves", async () => {
    const r = await requireCheckpoint("send_external_message", "test", { dryRun: true });
    assert(!r.approved && r.dryRun, "dry run misbehaved");
  });

  // 2 · guardrails fail closed
  const { check } = await import("../packages/skills/brand-guardrails/index");
  await t("guardrails: banned word blocked", async () => {
    const v = await check({ caption: "this rally is insane" });
    assert(!v.pass && v.violations[0].includes("banned"), JSON.stringify(v));
  });
  await t("guardrails: unscreened clip blocked (fail closed)", async () => {
    const v = await check({ caption: "great point", clipUrl: "file:///x.mp4", logoApplied: true });
    assert(!v.pass && v.violations.join().includes("screening"), JSON.stringify(v));
  });
  await t("guardrails: attested clip passes", async () => {
    const v = await check({ caption: "great point 🏓", clipUrl: "file:///x.mp4", logoApplied: true, minorFaceScreened: true });
    assert(v.pass, JSON.stringify(v));
  });

  // 3 · router ladder + escalation + judge constraint
  const { route, estimateCostUsd } = await import("../packages/core/router");
  await t("router: classify stays cheapest even on retry", () => {
    assert(route("classify", { attempt: 3 }).rung === "cheap", "escaped its ceiling");
  });
  await t("router: code escalates one rung per failed attempt", () => {
    assert(route("code", { attempt: 1 }).rung === "mid" && route("code", { attempt: 2 }).rung === "top", "ladder wrong");
  });
  await t("router: judge family constraint surfaces a warning", () => {
    const r = route("judge", { avoidFamilyOf: route("code").model });
    assert(r.warnings.length === 1, "constraint not surfaced");
  });
  await t("router: cost estimate is sane", () => {
    const c = estimateCostUsd("claude-haiku-4-5", 1000, 500);
    assert(c > 0 && c < 0.01, `got ${c}`);
  });

  // 4 · real video pipeline on synthetic footage
  const dir = mkdtempSync(join(tmpdir(), "st-"));
  const sample = join(dir, "sample.mp4");
  execFileSync("ffmpeg", ["-y","-f","lavfi","-i","testsrc=duration=8:size=640x360:rate=24","-pix_fmt","yuv420p", sample], { stdio: "ignore" });

  const { findMoments } = await import("../packages/skills/video-moments/index");
  await t("video-moments: missing footage → empty (valid day-1 state)", async () => {
    assert((await findMoments("/nope.mp4")).length === 0, "should be empty");
  });
  let start = 0.5, end = 3.5;
  await t("video-moments: real footage → scored, timestamped moments", async () => {
    const m = await findMoments(sample, { max: 3 });
    assert(m.length >= 2 && m[0].score > 0 && m[0].endSec > m[0].startSec, JSON.stringify(m));
    start = m[0].startSec; end = m[0].endSec;
  });

  const { renderClip } = await import("../packages/skills/video-edit/index");
  await t("video-edit: renders a real 1080x1920 clip with burned caption", async () => {
    const c = await renderClip({ videoUrl: sample, startSec: start, endSec: end, caption: "Match point 🏓" });
    const p = c.clipUrl.replace("file://", "");
    assert(existsSync(p), "output missing");
    const wh = execFileSync("ffprobe", ["-v","error","-select_streams","v:0","-show_entries","stream=width,height","-of","csv=p=0", p]).toString().trim();
    assert(wh === "1080,1920", `got ${wh}`);
    assert(c.durationSec > 1, "too short");
    assert(c.backend === "local", "expected local storage fallback");
  });

  // 5 · publish: checkpoint enforced end to end
  const { publish } = await import("../packages/skills/publish/index");
  await t("publish: refuses without approval", async () => {
    try { await publish({ platform: "tiktok", clipUrl: "file:///c.mp4", caption: "x" }); throw new Error("did not throw"); }
    catch (e) { assert((e as Error).name === "CheckpointPending", (e as Error).message); }
  });
  await t("publish: approved → manual outbox (no platform creds)", async () => {
    const r = await publish({ platform: "instagram", clipUrl: "file:///c.mp4", caption: "x" }, { approvalToken: "tok" });
    assert(r.status === "manual_outbox" && existsSync((r as { file: string }).file), JSON.stringify(r));
  });

  // 6 · budget policy: notify → pause → human approval → resume (consumed)
  const loopDir = ".loop";
  await t("budget: past-budget run PAUSES awaiting approval (exit 3)", () => {
    rmSync(loopDir, { recursive: true, force: true });
    execFileSync("mkdir", ["-p", loopDir]);
    execFileSync("bash", ["-c", `echo '{"task":"code","model":"x","rung":"top","in":1,"out":1,"usd":999}' > ${loopDir}/costs.jsonl`]);
    const r = spawnSync("npx", ["tsx", "scripts/autonomous-loop.ts", "--simulate"], { encoding: "utf8" });
    assert(r.status === 3 && r.stdout.includes("PAUSED"), `status ${r.status}`);
  });
  await t("budget: human approval resumes the run and is consumed", () => {
    execFileSync("touch", [`${loopDir}/budget-approved`]);
    const r = spawnSync("npx", ["tsx", "scripts/autonomous-loop.ts", "--simulate"], { encoding: "utf8" });
    assert(r.status === 0 && r.stdout.includes("GATE PASSED"), `status ${r.status}`);
    assert(!existsSync(`${loopDir}/budget-approved`), "approval not consumed");
    rmSync(loopDir, { recursive: true, force: true });
  });

  rmSync(dir, { recursive: true, force: true });
  console.log(`\n  ${pass} passed · ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}
main();
