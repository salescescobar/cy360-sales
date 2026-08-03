import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readRecognizedRevenue } from "../../../../../../packages/knowledge/revenue";
import { readCourtReserveTransactions } from "../../../../../../packages/knowledge/courtreserve";
import { computeReconciliation, summarizeReconciliation } from "../../../../../../packages/skills/reconciliation/index";
import { lastDayOfMonth } from "../../../../../../packages/skills/growth-report/index";
import { activeLocationSlugs } from "../../../lib/locations";
import { verifyAdminSession, ADMIN_SESSION_COOKIE_NAME } from "../../../lib/session";

const MONTH_RE = /^\d{4}-\d{2}$/;

/**
 * Spec #1 v5 section 4 / criterion #8 — the admin Reconciliation view. Never exposed to a
 * manager session or to no session at all (invariant #5).
 */
export async function GET(req: NextRequest) {
  const jar = await cookies();
  const admin = verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const location = url.searchParams.get("location") ?? "";
  const month = url.searchParams.get("month") ?? "";
  if (!activeLocationSlugs().includes(location)) {
    return NextResponse.json({ error: "unknown or inactive location" }, { status: 404 });
  }
  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ error: "invalid month — expected YYYY-MM" }, { status: 400 });
  }

  try {
    const from = `${month}-01`;
    const to = lastDayOfMonth(month);
    const [recognized, paymentBasis] = await Promise.all([
      readRecognizedRevenue(location, from, to),
      readCourtReserveTransactions(location, from, to),
    ]);
    const summary = summarizeReconciliation(computeReconciliation(recognized, paymentBasis));
    return NextResponse.json(summary);
  } catch (e) {
    console.error("reconciliation failed", e);
    return NextResponse.json({ error: "couldn't load the reconciliation view — try again shortly" }, { status: 500 });
  }
}
