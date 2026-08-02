/**
 * Loads .env.local for LOCAL runs. In CI the environment already carries the secrets,
 * so a missing file is never an error. Nothing here ever logs a value.
 * Warns when the shell and .env.local disagree — a silent winner causes 401 mysteries.
 */
import { existsSync, readFileSync } from "node:fs";

export function loadLocalEnv(file = ".env.local"): boolean {
  if (!existsSync(file)) return false;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!v) continue;
    const shell = process.env[k];
    if (shell && shell !== v) {
      console.warn(`⚠ ${k}: the shell value differs from .env.local — using .env.local (the project file wins)`);
    }
    process.env[k] = v;
  }
  return true;
}
