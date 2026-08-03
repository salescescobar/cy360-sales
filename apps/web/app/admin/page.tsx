import { redirect } from "next/navigation";

/** Deep link with no sub-page: send the admin to the managers page (which itself gates on the admin session). */
export default async function AdminIndexPage() {
  redirect("/admin/managers");
}
