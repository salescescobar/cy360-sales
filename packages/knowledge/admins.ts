/**
 * Admin accounts (email + password) — provision manager accounts and upload source data;
 * not scoped to a location. Supabase (`admins` table, supabase/migrations/0003_admins.sql)
 * when configured, local JSON fallback otherwise — same dual-backend pattern as managers.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { repoPath } from "../core/paths";
import { hashPassword, verifyPassword } from "./managers";

export type AdminAccount = {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
};

export { verifyPassword };

const LOCAL_DIR = repoPath(".local-storage", "warehouse");
const ADMINS_FILE = join(LOCAL_DIR, "admins.json");

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

function readLocalAdmins(): AdminAccount[] {
  return existsSync(ADMINS_FILE) ? JSON.parse(readFileSync(ADMINS_FILE, "utf8")) : [];
}

function writeLocalAdmins(admins: AdminAccount[]): void {
  mkdirSync(LOCAL_DIR, { recursive: true });
  writeFileSync(ADMINS_FILE, JSON.stringify(admins, null, 2));
}

export class EmailAlreadyRegisteredError extends Error {}

/** Idempotent: used by scripts/seed-admin.ts to bootstrap the first admin from env vars,
 *  and safe to re-run (a second call for the same email is a no-op, not an error). */
export async function ensureAdmin(email: string, password: string): Promise<AdminAccount> {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await findAdminByEmail(normalizedEmail);
  if (existing) return existing;
  return createAdmin(normalizedEmail, password);
}

export async function createAdmin(email: string, password: string): Promise<AdminAccount> {
  const normalizedEmail = email.trim().toLowerCase();
  const account: AdminAccount = {
    id: randomUUID(),
    email: normalizedEmail,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };

  if (supabaseConfigured()) {
    try {
      const existing = await supabaseRest(`admins?email=eq.${encodeURIComponent(normalizedEmail)}&select=id`);
      if (((await existing.json()) as unknown[]).length > 0) throw new EmailAlreadyRegisteredError(normalizedEmail);
      await supabaseRest("admins", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ id: account.id, email: account.email, password_hash: account.passwordHash, created_at: account.createdAt }),
      });
      return account;
    } catch (e) {
      if (e instanceof EmailAlreadyRegisteredError) throw e;
      if (!(e instanceof SchemaNotMigratedError)) throw e;
    }
  }

  const admins = readLocalAdmins();
  if (admins.some(a => a.email === normalizedEmail)) throw new EmailAlreadyRegisteredError(normalizedEmail);
  admins.push(account);
  writeLocalAdmins(admins);
  return account;
}

export async function findAdminByEmail(email: string): Promise<AdminAccount | null> {
  const normalizedEmail = email.trim().toLowerCase();

  if (supabaseConfigured()) {
    try {
      const res = await supabaseRest(`admins?email=eq.${encodeURIComponent(normalizedEmail)}&select=*`);
      const rows = (await res.json()) as Array<Record<string, unknown>>;
      if (rows.length === 0) return null;
      const r = rows[0];
      return { id: r.id as string, email: r.email as string, passwordHash: r.password_hash as string, createdAt: r.created_at as string };
    } catch (e) {
      if (!(e instanceof SchemaNotMigratedError)) throw e;
    }
  }

  return readLocalAdmins().find(a => a.email === normalizedEmail) ?? null;
}
