# CY360 Sales — v2 (supersedes v1; approved as issue #1)

## 1. What we're building
A web dashboard where each Crush Yard location manager sees their sales from GoTab (F&B) and
CourtReserve (courts), by day and by month, with prior-period comparatives. Data enters
through the web app: an admin uploads the CSV exports from each system and the product
normalizes, stores and reconciles them. Orlando is live; other locations activate by config.

## 2. Why upload instead of scraping (constraint discovered in v1)
GoTab and CourtReserve both block automated browsers (human verification), and neither
account has API access enabled yet. So v2's supported ingestion path is UPLOAD. The API mode
stays behind a config switch (`sources.*.mode: api`) for when credentials arrive; nothing
about the warehouse, dashboard or metrics changes when it flips.

## 3. Acceptance criteria — THE SYSTEM SHALL
1. WHEN an admin opens /import and uploads a GoTab or CourtReserve CSV export THE SYSTEM
   SHALL detect which source and which date(s) it covers, show a preview of the parsed
   totals, and only write to the warehouse after the admin confirms.
2. WHEN a confirmed upload is written THE SYSTEM SHALL store the raw file in Supabase
   Storage (bucket `imports`) and write one trace row per (location, date) recording which
   sources are present.
3. WHEN a date has data from only one source THE SYSTEM SHALL label that day "incomplete"
   and exclude it from comparatives — partial totals are never presented as final.
4. WHEN a manager opens their dashboard THE SYSTEM SHALL show a day view (that date's
   totals and breakdown per source) and a month view (monthly totals plus comparative).
5. WHEN the current month is incomplete THE SYSTEM SHALL compare LIKE FOR LIKE — the same
   number of elapsed days in the prior month — and label the comparison in words
   (e.g. "first 2 days vs first 2 days of July"). A raw full-month-vs-partial-month
   percentage is a defect.
6. WHEN re-uploading a file for a date that already has data THE SYSTEM SHALL replace that
   (location, date, source) row rather than duplicating it, and say so in the preview.
7. WHEN a manager signs in THE SYSTEM SHALL use credentials provisioned by an admin.
   There is NO public self-service signup. The admin creates manager accounts from an
   /admin/managers page; the seeded first admin is documented in README.
8. WHEN a CSV is malformed, empty, or from an unrecognized format THE SYSTEM SHALL reject
   it with a specific message naming the problem, and write nothing.

## 4. Invariants — THE SYSTEM SHALL NEVER
1. NEVER show one location's data to another location's manager. Enforced by Supabase RLS,
   not only in the UI (URL tampering must fail).
2. NEVER write to, modify or delete anything inside GoTab or CourtReserve.
3. NEVER store credentials for GoTab/CourtReserve anywhere in the codebase.
4. NEVER accept an upload into the warehouse without a trace row and a raw-file copy.
5. NEVER expose the upload or admin pages to a non-admin session.

## 5. Success metrics
- Upload to visible-on-dashboard: under 60 seconds, no terminal involved
- Dashboard load: under 3 seconds
- Totals within 1% of the source report (reconciliation view shows both side by side)
- Manager answers "how did we do?" in under 1 minute, one screen

## 6. Acceptance test per skill
- gotab-ingest: real GoTab CSV fixture -> normalized rows, totals match the file
- courtreserve-ingest: real CourtReserve CSV fixture -> normalized rows, totals match
- metrics: fixture rows -> day and month aggregates equal hand-computed values, and the
  partial-month comparative is like-for-like
- upload flow (Playwright): upload -> preview -> confirm -> value appears on the dashboard;
  malformed file rejected with a message; re-upload replaces instead of duplicating
- isolation (Playwright): Orlando manager cannot reach another location by editing the URL

## 7. Sensitive / irreversible actions
Replacing an existing day's data on re-upload is the only destructive-ish operation: it must
be explicit in the preview ("this will replace July 31 GoTab data") and confirmed by a human.

## 8. Out of scope (v2)
Automated scraping of either source · forecasting · writing to sources · customer PII ·
mobile app · Nashville / Mt. Pleasant ingestion (config-ready only).

## 9. Current state to build on
Warehouse tables + RLS already exist in Supabase (locations, manager_locations, daily_sales,
refresh_runs, managers). Storage buckets `imports` and `clips` exist. Two real GoTab days
(2026-08-01, 2026-08-02) are already loaded and must survive.
