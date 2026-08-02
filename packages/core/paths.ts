/**
 * Repo-root anchor. Scripts run with cwd = repo root, but `npm run dev --workspace web`
 * runs Next with cwd = apps/web — any module shared between the two (config.yaml,
 * .local-storage/, data/imports/) must resolve paths the same way from either.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function repoRoot(startDir: string = process.cwd()): string {
  let dir = resolve(startDir);
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "config.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`repoRoot: could not locate config.yaml by walking up from ${startDir}`);
}

export function repoPath(...segments: string[]): string {
  return join(repoRoot(), ...segments);
}
