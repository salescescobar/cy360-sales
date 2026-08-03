import { cookies } from "next/headers";
import { allLocations } from "../../../../lib/locations";
import { verifySession, SESSION_COOKIE_NAME } from "../../../../lib/session";
import DayViewClient from "./DayViewClient";

/** Criterion #7: the day view — same structure as the month report plus the hourly curve
 *  where available. Same auth gate as the month dashboard (invariant #1). */
export default async function DayViewPage({ params }: { params: Promise<{ location: string; date: string }> }) {
  const { location, date } = await params;
  const jar = await cookies();
  const session = verifySession(jar.get(SESSION_COOKIE_NAME)?.value);
  const info = allLocations().find(l => l.slug === location);

  if (!info || !info.active) {
    return <main><h1>Not found</h1><p>Unknown or inactive location.</p></main>;
  }
  if (!session) {
    return <main><h1>Sign in required</h1><p>You need to sign in to view this dashboard. <a href="/login">Sign in</a>.</p></main>;
  }
  if (session.locationSlug !== location) {
    return <main><h1>Access denied</h1><p>You&apos;re signed in for a different location. <a href="/login">Switch location</a>.</p></main>;
  }

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>{info.name} — Day view</h1>
        <a href={`/dashboard/${location}`}>← Back to dashboard</a>
      </div>
      <DayViewClient location={location} date={date} />
    </main>
  );
}
