import { cookies } from "next/headers";
import { allLocations } from "../../lib/locations";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage({ params }: { params: Promise<{ location: string }> }) {
  const { location } = await params;
  const jar = await cookies();
  const managerLocation = jar.get("manager_location")?.value;
  const info = allLocations().find(l => l.slug === location);

  if (!info || !info.active) {
    return (
      <main>
        <h1>Not found</h1>
        <p>Unknown or inactive location.</p>
      </main>
    );
  }

  // Invariant #1: never show one location's data to another location's manager.
  // Supabase RLS is the hard boundary once live; this UI gate is defense in depth.
  if (managerLocation !== location) {
    return (
      <main>
        <h1>Access denied</h1>
        <p>
          You&apos;re signed in for a different location. <a href="/login">Switch location</a>.
        </p>
      </main>
    );
  }

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>{info.name} — Sales</h1>
        <form method="POST" action="/api/logout">
          <button type="submit">Log out</button>
        </form>
      </div>
      <DashboardClient location={location} />
    </main>
  );
}
