/**
 * Skill: publish (Agent B). ALWAYS behind the checkpoint — this talks to the outside world.
 * Platform APIs plug in when approvals land; until then, MANUAL MODE: approved clips go
 * to an outbox and Slack, and a human posts them. Value ships on day one either way.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { requireCheckpoint } from "../../core/checkpoint";

export type Platform = "tiktok" | "instagram" | "facebook";
export type PublishReq = { platform: Platform; clipUrl: string; caption: string };

export async function publish(req: PublishReq, opts: { approvalToken?: string; dryRun?: boolean } = {}) {
  const gate = await requireCheckpoint("send_external_message", `publish to ${req.platform}: ${req.caption.slice(0, 40)}…`, opts);
  if (gate.dryRun) return { status: "dry_run" as const };

  const hasApi = !!process.env[`${req.platform.toUpperCase()}_ACCESS_TOKEN`];
  if (!hasApi) {
    mkdirSync(".loop/outbox", { recursive: true });
    const f = `.loop/outbox/${Date.now()}-${req.platform}.json`;
    writeFileSync(f, JSON.stringify({ ...req, approvedAt: new Date().toISOString(), mode: "manual" }, null, 2));
    const hook = process.env.SLACK_WEBHOOK_URL;
    if (hook) await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `📤 Ready to post manually on ${req.platform}: ${req.clipUrl}` }) }).catch(() => undefined);
    return { status: "manual_outbox" as const, file: f };
  }
  // Platform adapters land here once TikTok/Meta approvals arrive (Lesson 0.5 paperwork).
  throw new Error(`platform adapter for ${req.platform} not wired yet — approvals pending`);
}
