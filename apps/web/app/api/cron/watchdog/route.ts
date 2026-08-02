import { NextRequest, NextResponse } from "next/server";
import { runWatchdog } from "../../../../../../packages/loops/index";

/**
 * Vercel Cron target ~30 minutes after the refresh cron (spec #1 criteria #6): alerts Slack
 * when an active location has no refresh trace at all for the expected date — the refresh
 * itself already reports a source failure, so this only catches "nothing ran".
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runWatchdog();
    return NextResponse.json(result);
  } catch (e) {
    console.error("cron watchdog failed", e);
    return NextResponse.json({ error: "watchdog failed" }, { status: 500 });
  }
}
