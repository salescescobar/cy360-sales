import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { listFlags, resolveFlag } from "../../../../../../packages/knowledge/dataQuality";
import { verifyAdminSession, ADMIN_SESSION_COOKIE_NAME } from "../../../lib/session";

/**
 * /admin/data-quality's only surface — open flags (packages/core/dataQuality.ts writes them,
 * this just lists + resolves) and the Resolve action, which stamps who and when. Never
 * exposed to a manager session or to no session at all (same admin-only gate as every other
 * /api/admin/* route in this app).
 */
export async function GET(req: NextRequest) {
  const jar = await cookies();
  const admin = verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const location = url.searchParams.get("location") || undefined;
  const resolvedParam = url.searchParams.get("resolved");
  const resolved = resolvedParam == null ? undefined : resolvedParam === "true";

  try {
    const flags = await listFlags({ locationSlug: location, resolved });
    return NextResponse.json({ flags });
  } catch (e) {
    console.error("admin data-quality GET failed", e);
    return NextResponse.json({ error: "couldn't load data-quality flags — try again shortly" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const admin = verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  try {
    await resolveFlag(id, admin.adminId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("admin data-quality POST (resolve) failed", e);
    return NextResponse.json({ error: "couldn't resolve that flag — try again shortly" }, { status: 500 });
  }
}
