/**
 * Bootstraps a fixed, well-known admin account for automated e2e/judge testing — separate
 * from the real production admin (scripts/seed-admin.ts, ADMIN_EMAIL/ADMIN_PASSWORD, which
 * live only in .env.local). An unattended tester's permission policy correctly blocks
 * reading .env.local (see .claude/settings.json), so it has no way to learn the real admin's
 * password; this script gives it a legitimate, non-secret credential instead, the same way
 * tests/e2e/*.spec.ts already bootstrap their own throwaway admins via ensureAdmin(). Never
 * touches or reveals ADMIN_EMAIL/ADMIN_PASSWORD. Idempotent, like ensureAdmin itself. Refuses
 * to run against a real production deployment (NODE_ENV=production, same convention as
 * apps/web/app/api/admin/login/route.ts's cookie `secure` flag).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { loadLocalEnv } from "../packages/core/env";
loadLocalEnv();
import { ensureAdmin } from "../packages/knowledge/admins";
import { repoPath } from "../packages/core/paths";

export const JUDGE_ADMIN_EMAIL = "judge-admin@cy360-sales.test";
export const JUDGE_ADMIN_PASSWORD = "judge correct horse battery staple";

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("seed-judge-admin: refusing to run against a production deployment (NODE_ENV=production).");
    process.exit(1);
  }

  const admin = await ensureAdmin(JUDGE_ADMIN_EMAIL, JUDGE_ADMIN_PASSWORD);

  const fixturesDir = repoPath("tests/e2e/judge-fixtures");
  mkdirSync(fixturesDir, { recursive: true });
  writeFileSync(
    `${fixturesDir}/admin-credentials.json`,
    JSON.stringify({ email: admin.email, password: JUDGE_ADMIN_PASSWORD }, null, 2) + "\n",
  );

  console.log(`\n▶ Judge/test admin ready: ${admin.email}`);
  console.log(`  Password: ${JUDGE_ADMIN_PASSWORD}`);
  console.log("  Also written to tests/e2e/judge-fixtures/admin-credentials.json");
  console.log("  Sign in at /admin/login. Test-only account — never used for real Crush Yard data.\n");
}
main().catch(e => { console.error("seed-judge-admin failed:", e); process.exit(1); });
