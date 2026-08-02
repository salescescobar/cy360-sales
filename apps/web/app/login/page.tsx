import { allLocations } from "../lib/locations";

export const metadata = { title: "Sign in — CY360 Sales" };

/**
 * Demo login: pick your location. Real SSO/auth plugs in here before production —
 * Supabase RLS (supabase/migrations/0001_init.sql) is the actual isolation boundary,
 * this cookie is only which location's screen you land on.
 */
export default function LoginPage() {
  const locations = allLocations().filter(l => l.active);
  return (
    <main>
      <h1>CY360 Sales</h1>
      <p>Pick your location to continue.</p>
      <form method="POST" action="/api/login">
        {locations.map(l => (
          <label key={l.slug} style={{ display: "block", margin: "8px 0" }}>
            <input type="radio" name="location" value={l.slug} required /> {l.name}
          </label>
        ))}
        <button type="submit">Continue</button>
      </form>
    </main>
  );
}
