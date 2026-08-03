import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { detectAndParseUpload, checkUploadSize } from "../../../../../../packages/skills/upload-ingest/index";
import { readDay } from "../../../../../../packages/knowledge/index";
import { activeLocationSlugs } from "../../../lib/locations";
import { verifyAdminSession, ADMIN_SESSION_COOKIE_NAME } from "../../../lib/session";

/**
 * Criterion #1: parse an uploaded GoTab/CourtReserve export, detect source + date(s),
 * and return a preview — never writes to the warehouse. Confirmation happens at
 * /api/import/confirm, only after the admin reviews this response.
 */
export async function POST(req: NextRequest) {
  const jar = await cookies();
  if (!verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const location = String(form.get("location") ?? "");
  const file = form.get("file");
  if (!activeLocationSlugs().includes(location)) {
    return NextResponse.json({ error: "unknown or inactive location" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file uploaded" }, { status: 400 });
  }
  try {
    checkUploadSize(file.size, file.name);
  } catch (e) {
    // Criterion #8: reject before buffering — a hostile/oversized file must fail fast
    // with a specific message, never hang the preview step or silently no-op.
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const text = Buffer.from(await file.arrayBuffer()).toString("utf8");
  let parsed;
  try {
    parsed = detectAndParseUpload(text, file.name);
  } catch (e) {
    // Criterion #8: malformed/empty/unrecognized file -> specific message, nothing written.
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const days = await Promise.all(parsed.days.map(async day => {
    const existing = await readDay(location, day.date);
    const willReplace = existing.some(r => r.source === parsed.source);
    const totals =
      "totalTransactions" in day
        ? { totalGrossCents: day.totalGrossCents, count: day.totalTransactions, countLabel: "transactions" as const }
        : { totalGrossCents: day.totalGrossCents, count: day.totalReservations, countLabel: "reservations" as const };
    return { date: day.date, breakdown: day.breakdown, willReplace, ...totals };
  }));

  return NextResponse.json({
    source: parsed.source,
    location,
    filename: file.name,
    days,
  });
}
