/**
 * Manager accounts (email + password) — one location per manager. Supabase (`managers`
 * table, supabase/migrations/0002_managers.sql) when configured, local JSON fallback
 * otherwise, mirroring the dual-backend pattern in packages/knowledge/index.ts.
 * Passwords are never stored in plaintext (invariant #2 covers source credentials; this
 * extends the same discipline to our own manager accounts) — scrypt with a random salt.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { repoPath } from "../core/paths";

export type ManagerAccount = {
  id: string;
  email: string;
  passwordHash: string;
  locationSlug: string;
  createdAt: string;
};

const LOCAL_DIR = repoPath(".local-storage", "warehouse");
const MANAGERS_FILE = join(LOCAL_DIR, "managers.json");

function supabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

class SchemaNotMigratedError extends Error {}

async function supabaseRest(path: string, init: RequestInit = {}): Promise<Response> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 404 && body.includes("PGRST205")) throw new SchemaNotMigratedError(`table not found for ${path}`);
    throw new Error(`Supabase REST ${path} failed: ${res.status} ${body}`);
  }
  return res;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

function readLocalManagers(): ManagerAccount[] {
  return existsSync(MANAGERS_FILE) ? JSON.parse(readFileSync(MANAGERS_FILE, "utf8")) : [];
}

function writeLocalManagers(managers: ManagerAccount[]): void {
  mkdirSync(LOCAL_DIR, { recursive: true });
  writeFileSync(MANAGERS_FILE, JSON.stringify(managers, null, 2));
}

export class EmailAlreadyRegisteredError extends Error {}

/** Creates a manager account tied to exactly one location. Email must be unique. */
export async function createManager(email: string, password: string, locationSlug: string): Promise<ManagerAccount> {
  const normalizedEmail = email.trim().toLowerCase();
  const account: ManagerAccount = {
    id: randomUUID(),
    email: normalizedEmail,
    passwordHash: hashPassword(password),
    locationSlug,
    createdAt: new Date().toISOString(),
  };

  if (supabaseConfigured()) {
    try {
      const existing = await supabaseRest(`managers?email=eq.${encodeURIComponent(normalizedEmail)}&select=id`);
      if (((await existing.json()) as unknown[]).length > 0) throw new EmailAlreadyRegisteredError(normalizedEmail);
      await supabaseRest("managers", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          id: account.id, email: account.email, password_hash: account.passwordHash,
          location_slug: account.locationSlug, created_at: account.createdAt,
        }),
      });
      return account;
    } catch (e) {
      if (e instanceof EmailAlreadyRegisteredError) throw e;
      if (!(e instanceof SchemaNotMigratedError)) throw e;
    }
  }

  const managers = readLocalManagers();
  if (managers.some(m => m.email === normalizedEmail)) throw new EmailAlreadyRegisteredError(normalizedEmail);
  managers.push(account);
  writeLocalManagers(managers);
  return account;
}

export async function findManagerByEmail(email: string): Promise<ManagerAccount | null> {
  const normalizedEmail = email.trim().toLowerCase();

  if (supabaseConfigured()) {
    try {
      const res = await supabaseRest(`managers?email=eq.${encodeURIComponent(normalizedEmail)}&select=*`);
      const rows = (await res.json()) as Array<Record<string, unknown>>;
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id as string, email: r.email as string, passwordHash: r.password_hash as string,
        locationSlug: r.location_slug as string, createdAt: r.created_at as string,
      };
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
    }
  }

  return readLocalManagers().find(m => m.email === normalizedEmail) ?? null;
}

export async function findManagerById(id: string): Promise<ManagerAccount | null> {
  if (supabaseConfigured()) {
    try {
      const res = await supabaseRest(`managers?id=eq.${encodeURIComponent(id)}&select=*`);
      const rows = (await res.json()) as Array<Record<string, unknown>>;
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id as string, email: r.email as string, passwordHash: r.password_hash as string,
        locationSlug: r.location_slug as string, createdAt: r.created_at as string,
      };
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
    }
  }

  return readLocalManagers().find(m => m.id === id) ?? null;
}
