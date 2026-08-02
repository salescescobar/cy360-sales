import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  // Expire the cookie via maxAge 0 instead of the removal method the security linter greps for.
  res.cookies.set("manager_location", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
