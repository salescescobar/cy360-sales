import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, SESSION_COOKIE_NAME } from "../lib/session";

/** Deep link with no location: send the manager to their own dashboard, or sign in first. */
export default async function DashboardIndexPage() {
  const jar = await cookies();
  const session = verifySession(jar.get(SESSION_COOKIE_NAME)?.value);
  redirect(session ? `/dashboard/${session.locationSlug}` : "/login");
}
