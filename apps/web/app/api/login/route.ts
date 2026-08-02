import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findManagerByEmail, verifyPassword } from "../../../../../packages/knowledge/managers";
import { signSession, SESSION_COOKIE_NAME } from "../../lib/session";

const LoginForm = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const parsed = LoginForm.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) {
    return NextResponse.redirect(new URL("/login?error=invalid_credentials", req.url));
  }

  const manager = await findManagerByEmail(parsed.data.email);
  if (!manager || !verifyPassword(parsed.data.password, manager.passwordHash)) {
    return NextResponse.redirect(new URL("/login?error=invalid_credentials", req.url));
  }

  const res = NextResponse.redirect(new URL(`/dashboard/${manager.locationSlug}`, req.url));
  res.cookies.set(SESSION_COOKIE_NAME, signSession({ managerId: manager.id, locationSlug: manager.locationSlug }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days — session persists across reloads and browser restarts
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
