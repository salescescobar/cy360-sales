/**
 * Bootstraps the first admin account from env vars (spec #1 v2, criterion #7: "the seeded
 * first admin is documented in README" — this is that seed). Idempotent: re-running with the
 * same ADMIN_EMAIL is a no-op, never a duplicate or an error, so it's safe in CI/redeploys.
 */
import { loadLocalEnv } from "../packages/core/env";
loadLocalEnv();
import { ensureAdmin } from "../packages/knowledge/admins";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("seed-admin: set ADMIN_EMAIL and ADMIN_PASSWORD (see README) before running this script.");
    process.exit(1);
  }
  const admin = await ensureAdmin(email, password);
  console.log(`\n▶ Admin account ready: ${admin.email} (id ${admin.id})`);
  console.log("  Sign in at /admin/login.\n");
}
main().catch(e => { console.error("seed-admin failed:", e); process.exit(1); });
