/**
 * Skill: video-moments (Agent A). Footage in, timestamped moments out — with receipts.
 * Baseline (works on day one, no accounts): ffmpeg scene/segment heuristic.
 * Upgrade hook: vision model per frame via router runTask('extract') when a key exists.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

export type Moment = { startSec: number; endSec: number; court?: string; score: number; why: string };

function probeDuration(path: string): number {
  const out = execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","csv=p=0", path]).toString().trim();
  return parseFloat(out) || 0;
}

export async function findMoments(videoPath: string, opts: { max?: number } = {}): Promise<Moment[]> {
  if (!videoPath || !existsSync(videoPath.replace("file://",""))) return []; // no footage yet is a valid state
  const src = videoPath.replace("file://","");
  const dur = probeDuration(src);
  if (dur < 2) return [];

  // scene-change candidates (ffmpeg reports showinfo on stderr even on success)
  const probe = spawnSync("ffmpeg", ["-i", src, "-vf", "select='gt(scene,0.3)',showinfo", "-f", "null", "-"], { encoding: "utf8" });
  const times = [...(probe.stderr ?? "").matchAll(/pts_time:([0-9.]+)/g)].map(m => parseFloat(m[1]));
  // uniform fallback when footage has few hard cuts (common with fixed court cameras):
  // fewer, longer windows — a 2-second "moment" is never publishable anyway
  const nWin = Math.max(2, Math.min(6, Math.floor(dur / 4)));
  const bounds = times.length >= 3 ? [0, ...times, dur] : Array.from({ length: nWin + 1 }, (_, i) => (dur / nWin) * i);

  const max = opts.max ?? 7;
  const moments: Moment[] = [];
  for (let i = 0; i < bounds.length - 1 && moments.length < max * 2; i++) {
    const start = bounds[i], end = Math.min(bounds[i + 1], start + 45);
    const len = end - start;
    if (len < 2) continue;
    const centerBias = 1 - Math.abs((start + len / 2) / dur - 0.5); // mid-session rallies score higher
    const score = +(0.4 * Math.min(len / 30, 1) + 0.6 * centerBias).toFixed(2);
    moments.push({ startSec: +start.toFixed(2), endSec: +end.toFixed(2), score,
      why: times.length >= 3 ? "scene change segment (heuristic)" : "uniform segment (heuristic — enable the vision provider for real rally detection)" });
  }
  return moments.sort((a, b) => b.score - a.score).slice(0, max);
}
