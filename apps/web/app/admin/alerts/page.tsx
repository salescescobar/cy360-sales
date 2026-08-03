import { cookies } from "next/headers";
import { verifyAdminSession, ADMIN_SESSION_COOKIE_NAME } from "../../lib/session";
import AlertsClient from "./AlertsClient";

export const metadata = { title: "Alerts — CY360 Sales Admin" };

/** Criterion #5: the Slack alert pipeline's only admin-facing surface — config + history,
 *  never the webhook secret itself. Never exposed to a manager or no session (invariant #5). */
export default async function AdminAlertsPage() {
  const jar = await cookies();
  const session = verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return <main><h1>Admin sign in required</h1><p><a href="/admin/login">Sign in</a> as an admin to view alerts.</p></main>;
  }

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>Alerts</h1>
        <div>
          <a href="/admin/managers" style={{ marginRight: 16 }}>Managers</a>
          <a href="/admin/business-lines" style={{ marginRight: 16 }}>Business lines</a>
          <a href="/admin/reconciliation" style={{ marginRight: 16 }}>Reconciliation</a>
          <a href="/import" style={{ marginRight: 16 }}>Import sales data</a>
          <form method="POST" action="/api/admin/logout" style={{ display: "inline" }}>
            <button type="submit">Log out</button>
          </form>
        </div>
      </div>
      <p>
        Criterion #5: a line breaching report.thresholds gets a pill on the report and, at
        most once per day per line, a push to Slack. This is the wiring — the channel, the
        webhook, and every alert actually recorded — never the webhook secret itself
        (that lives in the SLACK_WEBHOOK_URL environment variable, per config.yaml -&gt; alerts).
      </p>
      <AlertsClient />
    </main>
  );
}
