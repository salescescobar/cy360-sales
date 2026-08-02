/**
 * Skill: video-edit (Agent B). Moment in → publishable 9:16 clip out. Real ffmpeg.
 * Caption text is burned when provided; auto-ASR subtitles = provider hook (GPU) pending.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveClip } from "../../core/storage";

export type ClipSpec = { videoUrl: string; startSec: number; endSec: number; logoPath?: string; caption?: string };

const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/%/g, "\\%");

export async function renderClip(spec: ClipSpec): Promise<{ clipUrl: string; durationSec: number; logoApplied: boolean; captionBurned: boolean; backend: string }> {
  const src = spec.videoUrl.replace("file://", "");
  if (!existsSync(src)) throw new Error(`source video not found: ${src}`);
  const out = join(mkdtempSync(join(tmpdir(), "clip-")), "clip.mp4");

  let captionBurned = !!spec.caption;
  const vf: string[] = ["scale=w=1080:h=1920:force_original_aspect_ratio=increase", "crop=1080:1920"];
  if (spec.caption) vf.push(`drawtext=text='${esc(spec.caption)}':fontcolor=white:fontsize=54:box=1:boxcolor=black@0.55:boxborderw=18:x=(w-text_w)/2:y=h-320`);

  const args = ["-y", "-ss", String(spec.startSec), "-to", String(spec.endSec), "-i", src];
  const logo = spec.logoPath && existsSync(spec.logoPath);
  if (logo) {
    args.push("-i", spec.logoPath as string,
      "-filter_complex", `[0:v]${vf.join(",")}[v];[v][1:v]overlay=W-w-40:40[out]`, "-map", "[out]");
  } else {
    args.push("-vf", vf.join(","));
  }
  args.push("-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-an", out);
  try {
    execFileSync("ffmpeg", args, { stdio: "ignore" });
  } catch (e) {
    // Portability: some ffmpeg builds ship without drawtext/freetype (common on macOS).
    // A missing caption burn must never fail the render — drop the overlay and continue.
    if (!spec.caption) throw e;
    const plain = ["-y", "-ss", String(spec.startSec), "-to", String(spec.endSec), "-i", src,
      "-vf", "scale=w=1080:h=1920:force_original_aspect_ratio=increase,crop=1080:1920",
      "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-an", out];
    execFileSync("ffmpeg", plain, { stdio: "ignore" });
    captionBurned = false;
  }

  const dur = parseFloat(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","csv=p=0", out]).toString()) || 0;
  const saved = await saveClip(out);
  return { clipUrl: saved.url, durationSec: +dur.toFixed(2), logoApplied: !!logo, captionBurned, backend: saved.backend };
}

/** Caption in brand voice: model via router when a key exists; deterministic fallback otherwise. */
export async function writeCaption(momentWhy: string, opts: { brand?: string } = {}): Promise<string> {
  try {
    const { runTask } = await import("../../core/router");
    return (await runTask("format", `Write a short social caption (<120 chars, max 2 emojis) for a pickleball clip: ${momentWhy}. Brand: ${opts.brand ?? "energetic club"}.`)).trim();
  } catch {
    return `Match point energy at the club today 🏓 #pickleball`; // deterministic fallback — no key needed
  }
}
