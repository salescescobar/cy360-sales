import { NextRequest, NextResponse } from "next/server";
import { activeLocationSlugs } from "../../lib/locations";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const location = String(form.get("location") ?? "");
  if (!activeLocationSlugs().includes(location)) {
    return NextResponse.redirect(new URL("/login?error=invalid_location", req.url));
  }
  const res = NextResponse.redirect(new URL(`/dashboard/${location}`, req.url));
  res.cookies.set("manager_location", location, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days — session persists across reloads and browser restarts
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
