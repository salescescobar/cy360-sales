import { NextRequest, NextResponse } from "next/server";
import { runDailySalesRefresh, etYesterday } from "../../../../../../packages/loops/index";

/**
 * Vercel Cron target for the daily-sales-refresh playbook (docs/architecture.md,
 * apps/web/vercel.json, spec #1 section 7: "E-Loop ... 6:00 ET, Vercel Cron"). Vercel signs
 * cron requests with `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set — reject
 * anything else so this ingestion trigger can't be hit by an outsider.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const date = etYesterday();
    const results = await runDailySalesRefresh(date);
    return NextResponse.json({ date, results });
  } catch (e) {
    console.error("cron refresh failed", e);
    return NextResponse.json({ error: "refresh failed" }, { status: 500 });
  }
}
