import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { loadCfg } from "../../../../../../packages/loops/index";
import { listRecentAlerts } from "../../../../../../packages/knowledge/revenue";
import { verifyAdminSession, ADMIN_SESSION_COOKIE_NAME } from "../../../lib/session";

/**
 * Criterion #5's Slack path ("pushed to Slack at most once per day per line") has no other
 * admin-facing surface — notifySlack() is fire-and-forget and posts straight to a webhook, so
 * without this route there is no admin UI at all that references Slack, config, or the alert
 * history it produced. This never exposes the webhook URL itself (secrets only via env, per
 * CLAUDE.md) — only whether one is configured, plus the channel/thresholds config and the
 * alerts_sent ledger, which is real evidence the pipeline fired. Never exposed to a manager
 * session or to no session (invariant #5).
 */
export async function GET(req: NextRequest) {
  const jar = await cookies();
  const admin = verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const cfg = loadCfg();
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50") || 50, 200);

  try {
    const alerts = await listRecentAlerts(limit);
    return NextResponse.json({
      config: {
        slackEnabled: cfg.report?.alerts.slack !== false,
        slackChannel: cfg.alerts?.slack_channel ?? null,
        maxPerLinePerDay: cfg.report?.alerts.max_per_line_per_day ?? 1,
        webhookConfigured: !!process.env.SLACK_WEBHOOK_URL,
        greenPct: cfg.report?.thresholds.green_pct ?? null,
        redPct: cfg.report?.thresholds.red_pct ?? null,
      },
      alerts,
    });
  } catch (e) {
    console.error("admin alerts GET failed", e);
    return NextResponse.json({ error: "couldn't load alert history — try again shortly" }, { status: 500 });
  }
}
