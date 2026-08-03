import { NextRequest, NextResponse } from "next/server";
import { runGrowthAlerts, etYesterday } from "../../../../../../packages/loops/index";

/**
 * Vercel Cron target dedicated to spec #1 v5 criterion #5 ("pushed to Slack at most once
 * per day per line"). The daily refresh cron (/api/cron/refresh) already calls
 * runGrowthAlerts once every location's day has landed, so this is a second, independently
 * triggerable path to the same idempotent alert pipeline — tryRecordAlert's (location,
 * business_line, sentOn) dedupe means running it twice for the same date is a no-op, never
 * a duplicate Slack message. This exists so alerting has its own observable entry point
 * instead of being reachable only as a side effect of ingestion succeeding.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const date = etYesterday();
    await runGrowthAlerts(date);
    return NextResponse.json({ date, ok: true });
  } catch (e) {
    console.error("cron alerts failed", e);
    return NextResponse.json({ error: "alerts failed" }, { status: 500 });
  }
}
