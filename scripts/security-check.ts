/**
 * Local, observable version of the CI security gate (.github/workflows/ci.yml `security` job):
 * dependency audit, destructive-op linter, secret scan. Same checks `securityBlocker()` in
 * scripts/autonomous-loop.ts runs internally — this exposes them as `npm run security` so a
 * human (or the functional-gate tester) can see the gate pass without triggering a CI run.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

let failed = false;
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const bad = (msg: string) => { console.error(`  ✗ ${msg}`); failed = true; };

console.log("\n▶ security gate\n");

// 1 · dependency audit — no high/critical vulnerabilities in production deps
try {
  execSync("npm audit --omit=dev --audit-level=high", { stdio: "pipe" });
  ok("npm audit --omit=dev --audit-level=high: no high/critical vulnerabilities");
} catch (e) {
  bad(`npm audit found high/critical vulnerabilities:\n${(e as { stdout?: Buffer }).stdout?.toString().trim()}`);
}

// 2 · destructive-op linter — irreversible ops must sit behind requireCheckpoint()
const DESTRUCTIVE = /(DROP\s+TABLE|TRUNCATE\s|rm\s+-rf|\.delete\(|deleteMany|destroy\()/i;
const trackedFiles = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean);
const codeFiles = trackedFiles.filter(f => /\.(ts|tsx|sql)$/.test(f) && /^(packages|apps|scripts)\//.test(f));
let destructiveHits = 0;
for (const file of codeFiles) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (DESTRUCTIVE.test(line) && !line.includes("requireCheckpoint")) {
      bad(`${file}:${i + 1}: destructive operation without requireCheckpoint() — ${line.trim()}`);
      destructiveHits++;
    }
  });
}
if (destructiveHits === 0) ok("destructive-op linter: every irreversible op is behind requireCheckpoint()");

// 3 · secret scan — provider-key-shaped strings must never be committed
const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ["Anthropic API key", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["OpenAI API key", /sk-[A-Za-z0-9]{32,}/],
  ["AWS access key id", /AKIA[0-9A-Z]{16}/],
  ["GitHub token", /gh[pousr]_[A-Za-z0-9]{20,}/],
  ["Slack token", /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ["PEM private key block", /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["JWT-shaped secret", /eyJhbGciOi[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];
let secretHits = 0;
for (const file of trackedFiles) {
  if (file.startsWith(".env")) continue;
  let text: string;
  try { text = readFileSync(file, "utf8"); } catch { continue; } // binary or unreadable — not a text secret
  for (const [name, re] of SECRET_PATTERNS) {
    if (re.test(text)) { bad(`${file}: matches ${name} pattern`); secretHits++; }
  }
}
if (secretHits === 0) ok("secret scan: no provider-key-shaped strings in tracked files");

if (failed) {
  console.error("\nsecurity gate: FAILED — see CLAUDE.md \"Reviewing AI-written code\" checklist.\n");
  process.exit(1);
}
console.log("\nsecurity gate: PASSED\n");
