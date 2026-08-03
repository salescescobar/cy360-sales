import { cookies } from "next/headers";
import { verifyAdminSession, ADMIN_SESSION_COOKIE_NAME } from "../lib/session";
import { allLocations } from "../lib/locations";
import ImportClient from "./ImportClient";

export const metadata = { title: "Import sales data — CY360 Sales Admin" };

export default async function ImportPage() {
  const jar = await cookies();
  const session = verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE_NAME)?.value);

  // Invariant #5: never expose the upload page to a non-admin session.
  if (!session) {
    return (
      <main>
        <h1>Admin sign in required</h1>
        <p><a href="/admin/login">Sign in</a> as an admin to upload sales data.</p>
      </main>
    );
  }

  const locations = allLocations().filter(l => l.active);

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>Import sales data</h1>
        <div>
          <a href="/admin/managers" style={{ marginRight: 16 }}>Managers</a>
          <form method="POST" action="/api/admin/logout" style={{ display: "inline" }}>
            <button type="submit">Log out</button>
          </form>
        </div>
      </div>
      <p>
        Upload a GoTab or CourtReserve CSV export. The source and date(s) are detected
        automatically — nothing is written until you confirm the preview.
      </p>
      <ImportClient locations={locations} />
    </main>
  );
}
