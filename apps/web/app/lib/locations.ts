import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { repoPath } from "../../../../packages/core/paths";

export type LocationInfo = { slug: string; name: string; active: boolean };

/** Display names — mirrors the seed data in supabase/migrations/0001_init.sql. */
const NAMES: Record<string, string> = {
  orlando: "Crush Yard Orlando",
  nashville: "Crush Yard Nashville",
  mt_pleasant: "Crush Yard Mt. Pleasant",
};

export function allLocations(): LocationInfo[] {
  const cfg = parse(readFileSync(repoPath("config.yaml"), "utf8")) as { locations: Record<string, { active: boolean }> };
  return Object.entries(cfg.locations).map(([slug, l]) => ({ slug, name: NAMES[slug] ?? slug, active: l.active }));
}

export function activeLocationSlugs(): string[] {
  return allLocations().filter(l => l.active).map(l => l.slug);
}
