import { cookies } from "next/headers";
import { verifyAdminSession, ADMIN_SESSION_COOKIE_NAME } from "../../lib/session";
import { allLocations } from "../../lib/locations";
import BusinessLinesClient from "./BusinessLinesClient";

export const metadata = { title: "Business lines — CY360 Sales Admin" };

/** Criterion #4: unmapped source items, and the admin assignment that writes business_line_map.
 *  Never exposed to a manager or no session (invariant #5). */
export default async function AdminBusinessLinesPage() {
  const jar = await cookies();
  const session = verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return <main><h1>Admin sign in required</h1><p><a href="/admin/login">Sign in</a> as an admin to manage business lines.</p></main>;
  }
  const locations = allLocations().filter(l => l.active);

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>Business lines</h1>
        <div>
          <a href="/admin/managers" style={{ marginRight: 16 }}>Managers</a>
          <a href="/admin/reconciliation" style={{ marginRight: 16 }}>Reconciliation</a>
          <a href="/import" style={{ marginRight: 16 }}>Import sales data</a>
          <form method="POST" action="/api/admin/logout" style={{ display: "inline" }}>
            <button type="submit">Log out</button>
          </form>
        </div>
      </div>
      <p>
        Every business line on the report is resolved through this mapping — never hardcoded
        (spec criterion #1). Anything that doesn&apos;t match a rule shows up below as
        Unmapped (criterion #4); assign it a business line and it&apos;ll count from the next report.
      </p>
      <BusinessLinesClient locations={locations.map(l => ({ slug: l.slug, name: l.name }))} />
    </main>
  );
}
