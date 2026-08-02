/**
 * Skill: brand-guardrails (Agent B). FAIL CLOSED: what can't be verified, doesn't ship.
 * Deterministic rules run always; vision-dependent rules block unless a screening
 * attestation is present (vision provider result or explicit human review).
 */
import { readFileSync } from "node:fs";
import { parse } from "yaml";

export type Asset = {
  caption?: string;
  clipUrl?: string;
  logoApplied?: boolean;        // attested by video-edit
  minorFaceScreened?: boolean;  // attested by vision provider OR human review (supervised mode)
};
export type Verdict = { pass: boolean; violations: string[] };

type Rules = { banned_words: string[]; max_caption_len: number; max_emojis: number; require_logo: boolean; block_minor_faces: boolean };
const rules = (): Rules => parse(readFileSync("prompts/brand-rules.yaml", "utf8")) as Rules;

export async function check(asset: Asset): Promise<Verdict> {
  const r = rules();
  const v: string[] = [];

  if (asset.caption !== undefined) {
    const c = asset.caption;
    if (c.length > r.max_caption_len) v.push(`caption too long (${c.length} > ${r.max_caption_len})`);
    for (const w of r.banned_words) if (c.toLowerCase().includes(w)) v.push(`banned word: "${w}"`);
    const emojis = (c.match(/\p{Extended_Pictographic}/gu) ?? []).length;
    if (emojis > r.max_emojis) v.push(`too many emojis (${emojis} > ${r.max_emojis})`);
  }
  if (asset.clipUrl !== undefined) {
    if (r.require_logo && !asset.logoApplied) v.push("logo not verified on clip (fail closed)");
    if (r.block_minor_faces && !asset.minorFaceScreened)
      v.push("minor-face screening missing — enable the vision provider or human-review the clip (fail closed)");
  }
  return { pass: v.length === 0, violations: v };
}
