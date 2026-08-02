# CY360 Sales — daily sales intelligence for Crush Yard locations
Approved as issue #1.

## 1. What we're building
One dashboard where each Crush Yard location manager sees their sales from GoTab (F&B) and
CourtReserve (courts), daily and monthly, mirroring the CY360 ops report. Refreshes every
morning at 6:00 a.m. ET. Read-only against the sources. Orlando in v1; other locations
activate by config only.

## 2. Acceptance criteria — THE SYSTEM SHALL
1. WHEN the daily refresh runs at 6:00 a.m. America/New_York THE SYSTEM SHALL ingest the
   previous day's GoTab sales and CourtReserve activity for every ACTIVE location into
   Supabase, and mark the day "complete" only if both sources loaded.
2. WHEN a manager opens their location's dashboard THE SYSTEM SHALL show daily and monthly
   views with totals, breakdowns and prior-period comparatives.
3. WHEN a source fails or returns partial data THE SYSTEM SHALL flag that day "incomplete",
   exclude it from comparatives, and notify Slack — never present partial totals as final.
4. WHEN credentials for a new location are added in config/env THE SYSTEM SHALL backfill and
   include it with ZERO code changes.
5. WHEN the initial load runs THE SYSTEM SHALL backfill the trailing 12 months for Orlando
   from both sources — via API if credentials exist, else from CSV files in /data/imports.
6. WHEN a scheduled refresh does not run THE SYSTEM SHALL alert Slack within 30 minutes.

## 3. Invariants — THE SYSTEM SHALL NEVER
1. NEVER show one location's data to another location's manager (Supabase RLS, not only UI).
2. NEVER store or log GoTab/CourtReserve credentials outside env/secrets.
3. NEVER write to, modify, or delete anything in GoTab or CourtReserve (read-only).
4. NEVER silently skip or fake a refresh; every run leaves a trace row.

## 4. Success metrics
- Refresh completed by 6:15 a.m.: >= 99% of days
- Dashboard load time: < 3 s
- Totals vs source reports: within 1% (reconciliation view)
- Manager time to answer "how did we do?": < 1 min, one screen

## 5. Acceptance test per skill
- gotab-ingest: fixture/CSV day in -> normalized rows with matching totals
- courtreserve-ingest: fixture/CSV day in -> normalized rows with matching totals
- metrics: fixture rows -> daily+monthly aggregates equal hand-computed values
- dashboard: Playwright — Orlando manager sees Orlando, other locations blocked, day/month toggle works
- refresh playbook: dry run flags an incomplete day and notifies Slack

## 6. Sensitive / irreversible actions
None — read-only ingestion, internal Slack notifications only.

## 7. Agents & skills
A-Knowledge = normalized Supabase warehouse (tables + RLS).
B-Core = metrics service + dashboard API (replaces the template's Review Queue).
E-Loop = playbook daily-sales-refresh (6:00 ET, Vercel Cron).
Skills to implement: gotab-ingest, courtreserve-ingest, metrics, dashboard.

## 8. Out of scope (v1)
Nashville / Mt. Pleasant ingestion (config-ready only), forecasting, writing to sources,
staff or PII data, mobile app.
