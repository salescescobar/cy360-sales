/**
 * Skill: business-lines (Agent A). Resolves a raw source (group, item) pair — a
 * CourtReserve FeeCategory/ItemName or a GoTab breakdown category/item — into one of the
 * report's business lines. The mapping itself is data (business_line_map — seeded below,
 * editable by an admin via /admin/business-lines), never hardcoded in a switch statement
 * (spec #1 v5 criterion #1: "resolved through business_line_map, never hardcoded").
 * A pair that matches nothing comes back "unmapped" — surfaced, never dropped (criterion #4).
 */

export type BusinessLine =
  | "food_beverage" | "pickleball" | "memberships" | "events"
  | "lessons" | "swag" | "arcade" | "sponsorships";

export const UNMAPPED = "unmapped" as const;

/** Report order (spec section 6, criterion #1) — the ONLY place this order is declared. */
export const BUSINESS_LINE_ORDER: BusinessLine[] = [
  "food_beverage", "pickleball", "memberships", "events", "lessons", "swag", "arcade", "sponsorships",
];

export const BUSINESS_LINE_LABELS: Record<BusinessLine, string> = {
  food_beverage: "Food & Beverage",
  pickleball: "Pickleball Revenue",
  memberships: "Memberships",
  events: "Events",
  lessons: "Lessons & Classes",
  swag: "Swag",
  arcade: "Arcade",
  sponsorships: "Sponsorships",
};

export type BusinessLineRule = {
  source: "gotab" | "courtreserve";
  matchGroup: string; // ILIKE pattern (case-insensitive substring/exact) against the source group name
  matchItem: string | null; // ILIKE pattern against the item name; null = matches any item in the group
  businessLine: BusinessLine;
  priority: number; // lower runs first; a rule with matchItem set should outrank its group-only sibling
};

/**
 * Seeded from the source contracts in spec section 3 (CourtReserve FeeCategory values) and
 * GoTab's existing breakdown categories (packages/skills/gotab-ingest fixtures). "Package" has
 * no group-only rule on purpose — a package could be a lesson bundle or a court bundle, and
 * guessing would silently mis-book revenue; it lands in Unmapped until an admin assigns each
 * item name it actually carries (criterion #4).
 */
export const DEFAULT_BUSINESS_LINE_RULES: BusinessLineRule[] = [
  { source: "courtreserve", matchGroup: "Membership Fee", matchItem: null, businessLine: "memberships", priority: 10 },
  { source: "courtreserve", matchGroup: "Event Registration", matchItem: null, businessLine: "events", priority: 10 },
  { source: "courtreserve", matchGroup: "Guest Fees - Events", matchItem: null, businessLine: "events", priority: 10 },
  { source: "courtreserve", matchGroup: "Reservation", matchItem: null, businessLine: "pickleball", priority: 10 },
  { source: "courtreserve", matchGroup: "Guest Fees - Reservations", matchItem: null, businessLine: "pickleball", priority: 10 },
  { source: "courtreserve", matchGroup: "Lesson", matchItem: null, businessLine: "lessons", priority: 10 },
  { source: "courtreserve", matchGroup: "Package", matchItem: "%lesson%", businessLine: "lessons", priority: 5 },
  { source: "courtreserve", matchGroup: "Package", matchItem: "%pickleball%", businessLine: "pickleball", priority: 5 },
  { source: "courtreserve", matchGroup: "Package", matchItem: "%court%", businessLine: "pickleball", priority: 5 },

  { source: "gotab", matchGroup: "food", matchItem: null, businessLine: "food_beverage", priority: 10 },
  { source: "gotab", matchGroup: "alcohol", matchItem: null, businessLine: "food_beverage", priority: 10 },
  { source: "gotab", matchGroup: "beverage", matchItem: null, businessLine: "food_beverage", priority: 10 },
  { source: "gotab", matchGroup: "swag", matchItem: null, businessLine: "swag", priority: 10 },
  { source: "gotab", matchGroup: "merchandise", matchItem: null, businessLine: "swag", priority: 10 },
  { source: "gotab", matchGroup: "arcade", matchItem: null, businessLine: "arcade", priority: 10 },
  { source: "gotab", matchGroup: "sponsorship", matchItem: null, businessLine: "sponsorships", priority: 10 },
];

/** ILIKE-style match: `%foo%` = substring, otherwise exact — both case-insensitive. */
function ilikeMatches(pattern: string, value: string): boolean {
  const p = pattern.toLowerCase();
  const v = value.toLowerCase();
  if (p.startsWith("%") && p.endsWith("%") && p.length >= 2) return v.includes(p.slice(1, -1));
  if (p.startsWith("%")) return v.endsWith(p.slice(1));
  if (p.endsWith("%")) return v.startsWith(p.slice(0, -1));
  return v === p;
}

/**
 * Resolves one (source, group, item) triple against the rule set, most specific/highest
 * priority match wins. Rules are evaluated lowest-`priority`-number first; the first rule
 * whose matchGroup AND (matchItem or null) both match decides the line.
 */
export function resolveBusinessLine(
  rules: BusinessLineRule[],
  source: "gotab" | "courtreserve",
  group: string,
  item: string,
): BusinessLine | typeof UNMAPPED {
  const candidates = rules
    .filter(r => r.source === source && ilikeMatches(r.matchGroup, group) && (r.matchItem == null || ilikeMatches(r.matchItem, item)))
    .sort((a, b) => a.priority - b.priority);
  return candidates.length > 0 ? candidates[0].businessLine : UNMAPPED;
}
