import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { buildPeriodInput } from "../../../../../../packages/loops/index";
import { buildDrilldown } from "../../../../../../packages/skills/growth-report/index";
import { listBusinessLineRules, addBusinessLineRule } from "../../../../../../packages/knowledge/revenue";
import { UNMAPPED, BUSINESS_LINE_ORDER } from "../../../../../../packages/skills/business-lines/index";
import { activeLocationSlugs } from "../../../lib/locations";
import { verifyAdminSession, ADMIN_SESSION_COOKIE_NAME } from "../../../lib/session";

const MONTH_RE = /^\d{4}-\d{2}$/;

/**
 * Criterion #4: "show any unmapped source item in an Unmapped row ... let an admin assign
 * it to a business line, writing business_line_map — nothing is silently dropped." GET
 * returns the current rules plus, for a given location/month, every unmapped (group, item)
 * pair with its amount; POST appends a new rule. Never exposed to a manager/no session
 * (invariant #5).
 */
export async function GET(req: NextRequest) {
  const jar = await cookies();
  const admin = verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const location = url.searchParams.get("location") ?? "";
  const month = url.searchParams.get("month") ?? "";

  const rules = await listBusinessLineRules();
  if (!location && !month) return NextResponse.json({ rules, unmapped: [] });

  if (!activeLocationSlugs().includes(location)) {
    return NextResponse.json({ error: "unknown or inactive location" }, { status: 404 });
  }
  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ error: "invalid month — expected YYYY-MM" }, { status: 400 });
  }

  try {
    const period = await buildPeriodInput(location, month);
    const daysInMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    const drilldown = buildDrilldown(period, daysInMonth, rules);
    const unmapped = (drilldown[UNMAPPED] ?? []).flatMap(g => g.items.map(i => ({
      group: g.group, item: i.item, amountCents: i.amountCents,
      source: i.transactions[0]?.source ?? "courtreserve",
    })));
    return NextResponse.json({ rules, unmapped });
  } catch (e) {
    console.error("business-lines GET failed", e);
    return NextResponse.json({ error: "couldn't load unmapped items — try again shortly" }, { status: 500 });
  }
}

const AssignBody = z.object({
  source: z.enum(["gotab", "courtreserve"]),
  matchGroup: z.string().min(1),
  matchItem: z.string().min(1).nullable(),
  businessLine: z.enum(BUSINESS_LINE_ORDER as [string, ...string[]]),
  priority: z.number().int().optional(),
});

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const admin = verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = AssignBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid assignment — need source, matchGroup, matchItem, businessLine" }, { status: 400 });

  const { source, matchGroup, matchItem, businessLine, priority } = parsed.data;
  await addBusinessLineRule({ source, matchGroup, matchItem, businessLine: businessLine as (typeof BUSINESS_LINE_ORDER)[number], priority: priority ?? 5 });
  return NextResponse.json({ ok: true });
}
