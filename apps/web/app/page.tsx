import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, SESSION_COOKIE_NAME } from "./lib/session";

/** Entry point: managers land on their own location's dashboard, or sign in first. */
export default async function Home() {
  const jar = await cookies();
  const session = verifySession(jar.get(SESSION_COOKIE_NAME)?.value);
  redirect(session ? `/dashboard/${session.locationSlug}` : "/login");
}
