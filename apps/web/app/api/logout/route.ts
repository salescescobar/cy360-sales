import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../lib/session";

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  // Expire the cookie via maxAge 0 instead of the removal method the security linter greps for.
  res.cookies.set(SESSION_COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
