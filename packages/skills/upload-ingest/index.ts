/**
 * Skill: upload-ingest (Agent A). The /import entry point (spec #1 v2, criterion #1):
 * given a raw uploaded file, detect which source it's from and which date(s) it covers,
 * without writing anything. Format-specific parsing stays in gotab-ingest/courtreserve-ingest
 * — this skill only sniffs the header to route to the right one, and turns "matches neither"
 * into the specific rejection criterion #8 requires.
 */
import { looksLikeGotabExport, parseGotabCsvExport, type GotabExportDay } from "../gotab-ingest/index";
import { looksLikeCourtReserveExport, parseCourtReserveCsvExport, type CourtReserveExportDay } from "../courtreserve-ingest/index";

export type DetectedUpload =
  | { source: "gotab"; days: GotabExportDay[] }
  | { source: "courtreserve"; days: CourtReserveExportDay[] };

/**
 * Detect + parse in one step. Throws a specific, human-readable message naming the
 * problem for anything empty, malformed, or unrecognized (criterion #8) — callers must
 * never write to the warehouse when this throws.
 */
export function detectAndParseUpload(text: string, originalFilename: string): DetectedUpload {
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new Error(`${originalFilename}: the file is empty`);

  const header = trimmed.split("\n")[0].split(",").map(h => h.trim());
  if (looksLikeGotabExport(header)) return { source: "gotab", days: parseGotabCsvExport(text) };
  if (looksLikeCourtReserveExport(header)) return { source: "courtreserve", days: parseCourtReserveCsvExport(text) };

  throw new Error(
    `${originalFilename}: unrecognized CSV format — this doesn't match a GoTab or CourtReserve export ` +
    `(got columns: ${header.join(", ")})`,
  );
}
