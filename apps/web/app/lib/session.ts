/**
 * Signed session cookie: proves the browser was actually issued this session by us (a
 * manager's location comes from their account, never from a value the browser can set
 * directly) — defense in depth on top of Supabase RLS (invariant #1: never show one
 * location's data to another's manager).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { repoPath } from "../../../../packages/core/paths";

export type Session = { managerId: string; locationSlug: string };
export type AdminSession = { adminId: string };

const COOKIE_NAME = "manager_session";
const ADMIN_COOKIE_NAME = "admin_session";
const SECRET_FILE = repoPath(".local-storage", "session-secret");

let warnedGeneratedSecret = false;

/** SESSION_SECRET should be set via env in real deployments (works across serverless
 *  instances/restarts). If it isn't, generate one and persist it locally rather than
 *  hard-failing every signup/login — the same env-configured-primary/local-fallback
 *  pattern used for Supabase across this codebase (packages/knowledge, managers.ts). A
 *  single-instance local secret is still an HMAC key no browser can forge; it just won't
 *  survive a multi-instance/ephemeral-fs deployment, which is why env is still preferred. */
function generatedSecret(): string {
  if (existsSync(SECRET_FILE)) return readFileSync(SECRET_FILE, "utf8").trim();
  const generated = randomBytes(32).toString("hex");
  mkdirSync(repoPath(".local-storage"), { recursive: true });
  writeFileSync(SECRET_FILE, generated);
  if (!warnedGeneratedSecret) {
    warnedGeneratedSecret = true;
    console.error(
      "⚠ SESSION_SECRET is not set — generated and persisted one at .local-storage/session-secret. " +
      "Set SESSION_SECRET in the environment for a real deployment (see .env.example).",
    );
  }
  return generated;
}

function secret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") return generatedSecret();
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

export function signAdminSession(session: AdminSession): string {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminSession(token: string | undefined): AdminSession | null {
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
    if (typeof parsed.adminId === "string") return parsed as AdminSession;
    return null;
  } catch {
    return null;
  }
}

export const ADMIN_SESSION_COOKIE_NAME = ADMIN_COOKIE_NAME;
