import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { detectAndParseUpload } from "../../../../../../packages/skills/upload-ingest/index";
import { readDay, writeDay, traceImportedDay, recordImportUpload, type DailySalesRow } from "../../../../../../packages/knowledge/index";
import { saveImportFile } from "../../../../../../packages/core/storage";
import { activeLocationSlugs } from "../../../lib/locations";
import { verifyAdminSession, ADMIN_SESSION_COOKIE_NAME } from "../../../lib/session";

/**
 * Criterion #1/#2/#6: writes only happen here, only after the admin has seen the preview.
 * Every date touched gets its (location, date, source) row upserted (never duplicated —
 * writeDay merges by source), a raw-file copy in Supabase Storage bucket `imports`, and a
 * trace row reflecting which sources are now present (invariant #4).
 */
export async function POST(req: NextRequest) {
  const jar = await cookies();
  const admin = verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const form = await req.formData();
  const location = String(form.get("location") ?? "");
  const file = form.get("file");
  if (!activeLocationSlugs().includes(location)) {
    return NextResponse.json({ error: "unknown or inactive location" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file uploaded" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = detectAndParseUpload(bytes.toString("utf8"), file.name);
  } catch (e) {
    // Criterion #8: parsing happens fully before any write below — a malformed file
    // writes nothing to the warehouse, storage, or trace.
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const firstDate = parsed.days[0].date;
  const stored = await saveImportFile(location, parsed.source, firstDate, file.name, bytes);

  const replaced: string[] = [];
  const written: string[] = [];
  for (const day of parsed.days) {
    const existing = await readDay(location, day.date);
    if (existing.some(r => r.source === parsed.source)) replaced.push(day.date);

    const row: DailySalesRow = {
      locationSlug: location,
      date: day.date,
      source: parsed.source,
      grossAmountCents: day.totalGrossCents,
      breakdown: day.breakdown,
    };
    await writeDay(location, day.date, [row]);
    await recordImportUpload({
      locationSlug: location, source: parsed.source, date: day.date,
      storagePath: stored.storagePath, originalFilename: file.name, uploadedBy: admin.adminId,
    });
    await traceImportedDay(location, day.date);
    written.push(day.date);
  }

  return NextResponse.json({ ok: true, source: parsed.source, location, dates: written, replaced });
}
