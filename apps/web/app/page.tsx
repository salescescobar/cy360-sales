import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** Entry point: managers land on their own location's dashboard, or sign in first. */
export default async function Home() {
  const jar = await cookies();
  const location = jar.get("manager_location")?.value;
  redirect(location ? `/dashboard/${location}` : "/login");
}
