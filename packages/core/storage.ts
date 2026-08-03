/**
 * B · Storage adapter. Supabase when keys exist; local .local-storage/ otherwise.
 * The local fallback is what lets the whole pipeline run on day one with zero accounts.
 */
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

/** Vercel serverless functions have no writable disk — mirrors the same rule
 *  packages/knowledge/index.ts applies to the warehouse tables. */
function onVercel(): boolean {
  return process.env.VERCEL === "1";
}

/** Bucket-aware upload — Supabase Storage when configured, local .local-storage/<bucket>/
 *  otherwise. Shared by saveClip (bucket "clips") and saveImportFile (bucket "imports",
 *  spec #1 v2 criterion #2: confirmed uploads must keep a raw-file copy). */
export async function uploadToBucket(
  bucket: string,
  key: string,
  bytes: Buffer,
  contentType: string,
): Promise<{ url: string; backend: "supabase" | "local" }> {
  const url = process.env.SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_KEY;
  if (url && svc) {
    // Buffer's ArrayBufferLike generic isn't narrow enough for fetch's BodyInit overloads
    // (a TS lib quirk, not a real type-safety gap) — Uint8Array.from re-derives a concrete
    // ArrayBuffer-backed view of the same bytes.
    const res = await fetch(`${url}/storage/v1/object/${bucket}/${key}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${svc}`, "Content-Type": contentType, "x-upsert": "true" },
      body: Uint8Array.from(bytes),
    });
    if (!res.ok) throw new Error(`Supabase upload failed: ${res.status} ${await res.text()}`);
    return { url: `${url}/storage/v1/object/${bucket}/${key}`, backend: "supabase" };
  }
  if (onVercel()) {
    throw new Error(
      `uploadToBucket(${bucket}): Supabase is not configured and Vercel has no writable disk for the local ` +
      "fallback — set SUPABASE_URL/SUPABASE_SERVICE_KEY.",
    );
  }
  const dir = join(process.cwd(), ".local-storage", bucket, ...key.split("/").slice(0, -1));
  mkdirSync(dir, { recursive: true });
  const dest = join(process.cwd(), ".local-storage", bucket, key);
  writeFileSync(dest, bytes);
  return { url: `file://${dest}`, backend: "local" };
}

export async function saveClip(localPath: string, key?: string): Promise<{ url: string; backend: "supabase" | "local" }> {
  const name = key ?? `${Date.now()}-${basename(localPath)}`;
  const url = process.env.SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_KEY;
  if (url && svc) {
    const { readFileSync } = await import("node:fs");
    return uploadToBucket("clips", name, readFileSync(localPath), "video/mp4");
  }
  const dir = join(process.cwd(), ".local-storage", "clips");
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, name);
  copyFileSync(localPath, dest);
  return { url: `file://${dest}`, backend: "local" };
}

/** Raw-file copy of a confirmed import (criterion #2). Key layout mirrors daily_sales'
 *  natural key so a raw file is easy to find later: <location>/<source>/<date>-<filename>. */
export async function saveImportFile(
  locationSlug: string,
  source: "gotab" | "courtreserve",
  date: string,
  originalFilename: string,
  bytes: Buffer,
): Promise<{ url: string; storagePath: string; backend: "supabase" | "local" }> {
  const safeFilename = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${locationSlug}/${source}/${date}-${safeFilename}`;
  const { url, backend } = await uploadToBucket("imports", storagePath, bytes, "text/csv");
  return { url, storagePath, backend };
}
