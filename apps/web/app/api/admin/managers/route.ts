import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { activeLocationSlugs } from "../../../lib/locations";
import { createManager, listManagers, EmailAlreadyRegisteredError } from "../../../../../../packages/knowledge/managers";
import { verifyAdminSession, ADMIN_SESSION_COOKIE_NAME } from "../../../lib/session";

async function requireAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE_NAME)?.value) !== null;
}

/** Invariant #5: never expose the admin pages to a non-admin session — this API is the
 *  only writer of manager accounts now that /signup is gone (criterion #7). */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const managers = await listManagers();
  return NextResponse.json(managers.map(m => ({ id: m.id, email: m.email, locationSlug: m.locationSlug, createdAt: m.createdAt })));
}

const CreateManagerForm = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  location: z.string(),
});

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const form = await req.formData();
  const parsed = CreateManagerForm.safeParse({ email: form.get("email"), password: form.get("password"), location: form.get("location") });
  if (!parsed.success || !activeLocationSlugs().includes(parsed.data.location)) {
    return NextResponse.redirect(new URL("/admin/managers?error=invalid", req.url));
  }

  try {
    await createManager(parsed.data.email, parsed.data.password, parsed.data.location);
    return NextResponse.redirect(new URL("/admin/managers?created=1", req.url));
  } catch (e) {
    if (e instanceof EmailAlreadyRegisteredError) {
      return NextResponse.redirect(new URL("/admin/managers?error=email_taken", req.url));
    }
    console.error("admin: create manager failed", e);
    return NextResponse.redirect(new URL("/admin/managers?error=server_error", req.url));
  }
}
