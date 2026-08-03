# CY360 Sales — v5 FINAL (supersedes all earlier versions; approved as issue #1)

## 1. What this is
ONE report per Crush Yard location that merges GoTab (F&B, swag, arcade) with CourtReserve
(courts, memberships, events, lessons) so a location manager knows how their operation is
doing in under a minute — focused on GROWTH, not just totals.

Every business line shows three columns: this month to date · prior month, same elapsed days ·
same month last year, same elapsed days. Plus alerts when a line moves outside its threshold.

## 2. RECOGNIZED REVENUE ONLY (the rule that shapes everything)
The client's previous report mixed in future bookings whose amounts can still change. This
product reports revenue that is RECOGNIZED — earned by service date — and states the basis on
screen ("Recognized revenue through <date>"). Future bookings, if shown at all, live in a
separate "Booked, not yet recognized" panel and are NEVER inside a total.

## 3. VERIFIED SOURCE CONTRACTS (tested live 2026-08-03 — do not re-derive)
CourtReserve, HTTP Basic auth: user COURTRESERVE_API_USER (Org_13523_3), pass
COURTRESERVE_API_PASS, org 13523 = "Crush Yard - Orlando, FL".

- GET /api/v1/revenuerecognition/list?start=YYYY-MM-DD&end=YYYY-MM-DD — THE report source.
  Params are literally `start` and `end`, filtering by SERVICE date, not payment date.
  Returns { ErrorMessage, Data: [...] }; June 2026 returned 4,579 rows. Row fields:
  FeeCategory · Subtotal · TaxTotal · Total · PaymentType · StartDateTime · EndDateTime ·
  PaidDate · OrganizationMemberId · MemberFirstName · MemberLastName · Description ·
  AdditionalDates · FeeId · PaymentId · RelationId · TransactionType · PackageInfo
  FeeCategory values seen: Event Registration · Reservation · Guest Fees - Reservations ·
  Guest Fees - Events · Membership Fee · Package · Lesson
- GET /api/v1/transactions/salessummarydetailed?paymentStartDate=&paymentEndDate=
  payment basis, already loaded (60,860 rows) — drill-down and reconciliation counterpart.
- GET /api/v1/reservationreport/courtutilization?startDate=&endDate= — court utilisation.

GoTab has NO API enabled (bot protection blocks automated login). Its daily summary is loaded
by an operator-run backfill and by /import upload. Closed fiscal days only: a day with open
tabs is "open" and excluded from comparatives.

## 4. THE KNOWN DISCREPANCY — build the reconciliation, don't hide it
revenuerecognition/list sums $149,573.32 for June 2026; the client's own June report says
$106,361.75. THE SYSTEM SHALL provide an admin Reconciliation view for any month showing, per
FeeCategory and per TransactionType: recognized total, payment-basis total, tax, and the delta
— so the CEO can decide the rule (which categories count, whether PackageInfo rows
double-count purchase and usage, tax in or out). The chosen rule lives in config
(report.recognition) and the report obeys it. Never silently pick a number that doesn't match
the client's books.

## 5. Data model — ALREADY IN SUPABASE, additive changes only
revenue_recognized (location, source, period_month, business_date, group_name, item_name,
amount/tax/net cents, recognized_on, raw) · business_line_map (source, match_group,
match_item ILIKE, business_line, priority — seeded) · sales_transactions · court_reservations
· payment_type_totals · sales_hourly · daily_sales · refresh_runs · imports · import_uploads ·
managers · admins · manager_locations · locations.
Nineteen months of real data are loaded (60,860 CourtReserve transactions, 569 GoTab days) and
MUST survive. Any migration MUST be additive AND applied to Supabase in the same run — a gate
that passes against the local fallback is a FALSE PASS.

## 6. Acceptance criteria — THE SYSTEM SHALL
1. Show business lines in this order, resolved through business_line_map (never hardcoded):
   Food & Beverage · Pickleball Revenue · Memberships · Events · Lessons & Classes · Swag ·
   Arcade · Sponsorships → Gross Revenues · Discounts · Total.
2. For each line show the three columns of §1 plus a LABELLED % per comparison, and a
   "# Days" row stating the elapsed days used by each column.
3. Drill down business line → group → item → transactions in at most three clicks, so any
   figure is traceable (Pickleball → Reservation Types → "Indoor Pickleball" → its rows).
4. Show any unmapped source item in an "Unmapped" row with its amount, and let an admin assign
   it to a business line (writing business_line_map) — nothing is silently dropped.
5. Raise an alert when a line breaches report.thresholds versus EITHER comparison: visible on
   the report and pushed to Slack at most once per day per line.
6. Label incomplete periods (missing source, or a GoTab day still open), exclude them from
   comparatives, and state exactly what is missing.
7. Offer a day view with the same structure plus the hourly curve where available.
8. Provide the admin Reconciliation view of §4.
9. Use admin-provisioned credentials only — no public signup; document the seeded admin and
   first sign-in in README (ADMIN_EMAIL/ADMIN_PASSWORD + npm run seed:admin).
10. Ingest via /import upload with preview-then-confirm, raw file stored, audit row written.

## 7. Invariants — THE SYSTEM SHALL NEVER
1. NEVER show one location's data to another location's manager (Supabase RLS, not only UI).
2. NEVER include unrecognized or future revenue in a total.
3. NEVER store customer personal data — drop MemberFirstName, MemberLastName, MemberFullName,
   FamilyName before persisting; keep only opaque ids.
4. NEVER write to, modify or delete anything inside GoTab or CourtReserve.
5. NEVER expose /import, /admin or Reconciliation to a manager session or to no session.
6. NEVER show a percentage without stating what it compares.

## 8. Design — AI Labs brandbook with the client's VERIFIED palette
Tokens already exist in apps/web/app/lib/theme.ts. USE THEM; never hardcode a colour.
Crush Yard palette verified from crushyard.com/orlando on 2026-08-03: accent #E8503E
(buttons, emphasis, positive movement) · accentSoft #E97263 · deep #130B36 / #1E1545 (dark
surfaces) · muted #4B446A · text secondary #69727D, tertiary #494C4F · ink #16181D on white
and #FAFAFA surfaces. Display type "SS Nickson One" (their heading face, Helvetica fallback);
body Helvetica. Traffic lights up #1E8E5A · flat #B08900 · down #C0392B, ALWAYS paired with the
number's sign — colour is never the only signal.
Layout: thin rules under column headers, above Gross Revenues and above Total; bold ONLY on
those two rows; tabular numerals, right-aligned figures, thousands separators, negatives in
parentheses, em dash for absent values (never $0.00); generous whitespace; one type scale; no
default browser tables. It must look like something a manager screenshots and sends the owner.

## 9. Out of scope (v5)
Automated scraping of GoTab · forecasting · writing to sources · customer PII · mobile app ·
Nashville / Mt. Pleasant ingestion (config-ready only).
