/**
 * Signed session cookie: proves the browser was actually issued this session by us (a
 * manager's location comes from their account, never from a value the browser can set
 * directly) — defense in depth on top of Supabase RLS (invariant #1: never show one
 * location's data to another's manager).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type Session = { managerId: string; locationSlug: string };

const COOKIE_NAME = "manager_session";

function secret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production — see .env.example");
  }
  return "dev-only-insecure-secret-set-SESSION_SECRET-in-.env.local";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function signSession(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySession(token: string | undefined): Session | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof parsed.managerId === "string" && typeof parsed.locationSlug === "string") return parsed as Session;
    return null;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
