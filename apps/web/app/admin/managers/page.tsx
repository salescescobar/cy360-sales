import { cookies } from "next/headers";
import { verifyAdminSession, ADMIN_SESSION_COOKIE_NAME } from "../../lib/session";
import { allLocations } from "../../lib/locations";
import { listManagers } from "../../../../../packages/knowledge/managers";

export const metadata = { title: "Managers — CY360 Sales Admin" };

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Please fill in a valid email, a password of at least 8 characters, and pick a location.",
  email_taken: "An account with that email already exists.",
  server_error: "Something went wrong creating the account. Please try again.",
};

export default async function AdminManagersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string }>;
}) {
  const { error, created } = await searchParams;
  const jar = await cookies();
  const session = verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE_NAME)?.value);

  // Invariant #5: never expose the admin pages to a non-admin session.
  if (!session) {
    return (
      <main>
        <h1>Admin sign in required</h1>
        <p><a href="/admin/login">Sign in</a> as an admin to manage manager accounts.</p>
      </main>
    );
  }

  const locations = allLocations().filter(l => l.active);
  const managers = await listManagers();

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>Managers</h1>
        <div>
          <a href="/admin/reconciliation" style={{ marginRight: 16 }}>Reconciliation</a>
          <a href="/admin/business-lines" style={{ marginRight: 16 }}>Business lines</a>
          <a href="/import" style={{ marginRight: 16 }}>Import sales data</a>
          <form method="POST" action="/api/admin/logout" style={{ display: "inline" }}>
            <button type="submit">Log out</button>
          </form>
        </div>
      </div>

      {error && <p role="alert">{ERROR_MESSAGES[error] ?? "Couldn't create the account — try again."}</p>}
      {created && <p role="status">Manager account created.</p>}

      <section>
        <h2>Create a manager account</h2>
        <form method="POST" action="/api/admin/managers">
          <label style={{ display: "block", margin: "8px 0" }}>
            Email
            <br />
            <input type="email" name="email" required autoComplete="off" />
          </label>
          <label style={{ display: "block", margin: "8px 0" }}>
            Temporary password
            <br />
            <input type="password" name="password" required minLength={8} autoComplete="off" />
          </label>
          <fieldset style={{ margin: "8px 0" }}>
            <legend>Location</legend>
            {locations.map(l => (
              <label key={l.slug} style={{ display: "block", margin: "4px 0" }}>
                <input type="radio" name="location" value={l.slug} required /> {l.name}
              </label>
            ))}
          </fieldset>
          <button type="submit">Create manager</button>
        </form>
      </section>

      <section>
        <h2>Existing managers</h2>
        {managers.length === 0 ? (
          <p>No manager accounts yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Email</th><th>Location</th><th>Created</th></tr>
            </thead>
            <tbody>
              {managers.map(m => (
                <tr key={m.id}>
                  <td>{m.email}</td>
                  <td>{m.locationSlug}</td>
                  <td>{new Date(m.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
