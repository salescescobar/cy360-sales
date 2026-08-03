import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findAdminByEmail } from "../../../../../../packages/knowledge/admins";
import { verifyPassword } from "../../../../../../packages/knowledge/managers";
import { signAdminSession, ADMIN_SESSION_COOKIE_NAME } from "../../../lib/session";

const LoginForm = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const parsed = LoginForm.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) {
    return NextResponse.redirect(new URL("/admin/login?error=invalid_credentials", req.url));
  }

  const admin = await findAdminByEmail(parsed.data.email);
  if (!admin || !verifyPassword(parsed.data.password, admin.passwordHash)) {
    return NextResponse.redirect(new URL("/admin/login?error=invalid_credentials", req.url));
  }

  const res = NextResponse.redirect(new URL("/admin/managers", req.url));
  res.cookies.set(ADMIN_SESSION_COOKIE_NAME, signAdminSession({ adminId: admin.id }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
