/**
 * B · Storage adapter. Supabase when keys exist; local .local-storage/ otherwise.
 * The local fallback is what lets the whole pipeline run on day one with zero accounts.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";

export async function saveClip(localPath: string, key?: string): Promise<{ url: string; backend: "supabase" | "local" }> {
  const name = key ?? `${Date.now()}-${basename(localPath)}`;
  const url = process.env.SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_KEY;
  if (url && svc) {
    const { readFileSync } = await import("node:fs");
    const res = await fetch(`${url}/storage/v1/object/clips/${name}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${svc}`, "Content-Type": "video/mp4", "x-upsert": "true" },
      body: new Uint8Array(readFileSync(localPath)),
    });
    if (!res.ok) throw new Error(`Supabase upload failed: ${res.status} ${await res.text()}`);
    return { url: `${url}/storage/v1/object/clips/${name}`, backend: "supabase" };
  }
  const dir = join(process.cwd(), ".local-storage", "clips");
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, name);
  copyFileSync(localPath, dest);
  return { url: `file://${dest}`, backend: "local" };
}
