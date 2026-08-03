import { cookies } from "next/headers";
import { verifyAdminSession, ADMIN_SESSION_COOKIE_NAME } from "../../lib/session";
import DataQualityClient from "./DataQualityClient";

export const metadata = { title: "Data quality — CY360 Sales Admin" };

/** Open data-quality flags (packages/core/dataQuality.ts) + the Resolve action. Never
 *  exposed to a manager or no session (invariant #5, same pattern as every other admin page). */
export default async function AdminDataQualityPage() {
  const jar = await cookies();
  const session = verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return <main><h1>Admin sign in required</h1><p><a href="/admin/login">Sign in</a> as an admin to view data-quality flags.</p></main>;
  }

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>Data quality</h1>
        <div>
          <a href="/admin/managers" style={{ marginRight: 16 }}>Managers</a>
          <a href="/admin/business-lines" style={{ marginRight: 16 }}>Business lines</a>
          <a href="/admin/reconciliation" style={{ marginRight: 16 }}>Reconciliation</a>
          <a href="/admin/alerts" style={{ marginRight: 16 }}>Alerts</a>
          <a href="/import" style={{ marginRight: 16 }}>Import sales data</a>
          <form method="POST" action="/api/admin/logout" style={{ display: "inline" }}>
            <button type="submit">Log out</button>
          </form>
        </div>
      </div>
      <p>
        Every day and month an automated guardrail suspects is wrong — an outlier vs. trailing
        history, or a GoTab day scripts/gotab-verify.ts couldn&apos;t re-verify. Resolve only
        after you&apos;ve confirmed the figure; nothing here clears itself.
      </p>
      <DataQualityClient />
    </main>
  );
}
