import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { activeLocationSlugs } from "../../lib/locations";
import { createManager, EmailAlreadyRegisteredError } from "../../../../../packages/knowledge/managers";
import { signSession, SESSION_COOKIE_NAME } from "../../lib/session";

const SignupForm = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  location: z.string(),
});

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const parsed = SignupForm.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    location: form.get("location"),
  });
  if (!parsed.success || !activeLocationSlugs().includes(parsed.data.location)) {
    return NextResponse.redirect(new URL("/signup?error=invalid", req.url));
  }

  const { email, password, location } = parsed.data;
  try {
    const manager = await createManager(email, password, location);
    const res = NextResponse.redirect(new URL(`/dashboard/${location}`, req.url));
    res.cookies.set(SESSION_COOKIE_NAME, signSession({ managerId: manager.id, locationSlug: location }), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch (e) {
    if (e instanceof EmailAlreadyRegisteredError) {
      return NextResponse.redirect(new URL("/signup?error=email_taken", req.url));
    }
    throw e;
  }
}
