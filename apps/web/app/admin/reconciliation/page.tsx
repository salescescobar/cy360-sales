import { cookies } from "next/headers";
import { verifyAdminSession, ADMIN_SESSION_COOKIE_NAME } from "../../lib/session";
import { allLocations } from "../../lib/locations";
import ReconciliationClient from "./ReconciliationClient";

export const metadata = { title: "Reconciliation — CY360 Sales Admin" };

/** Spec #1 v5 section 4 / criterion #8. Never exposed to a manager or no session (invariant #5). */
export default async function AdminReconciliationPage() {
  const jar = await cookies();
  const session = verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return <main><h1>Admin sign in required</h1><p><a href="/admin/login">Sign in</a> as an admin to view reconciliation.</p></main>;
  }
  const locations = allLocations().filter(l => l.active);

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>Reconciliation</h1>
        <div>
          <a href="/admin/managers" style={{ marginRight: 16 }}>Managers</a>
          <a href="/admin/business-lines" style={{ marginRight: 16 }}>Business lines</a>
          <a href="/admin/alerts" style={{ marginRight: 16 }}>Alerts</a>
          <a href="/import" style={{ marginRight: 16 }}>Import sales data</a>
          <form method="POST" action="/api/admin/logout" style={{ display: "inline" }}>
            <button type="submit">Log out</button>
          </form>
        </div>
      </div>
      <p>
        Recognized revenue (revenuerecognition/list, service-date basis) vs payment-basis
        (salessummarydetailed) — every discrepancy shown, never silently resolved (spec section 4).
      </p>
      <ReconciliationClient locations={locations.map(l => ({ slug: l.slug, name: l.name }))} />
    </main>
  );
}
