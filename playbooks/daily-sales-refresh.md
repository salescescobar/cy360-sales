# Playbook: daily-sales-refresh (E-Loop)

Goal: every ACTIVE location's dashboard reflects yesterday's GoTab (F&B) and CourtReserve
(courts) activity, loaded before 6:15 a.m. America/New_York >= 99% of days.

Trigger: cron `0 6 * * *` America/New_York (Vercel Cron) — the previous calendar day.

Loop, per active location (config.yaml -> locations):
  1. Gather → gotab-ingest.ingestGotabDay(location, date) and
              courtreserve-ingest.ingestCourtReserveDay(location, date).
              mode comes from config.yaml -> sources.{gotab,courtreserve}.mode: "api" when
              credentials exist, else "csv" from /data/imports — zero code changes either way.
  2. Act    → normalized rows go to the Supabase warehouse (knowledge.writeDay).
  3. Verify → both sources loaded → day "complete". Either missing or errored → day
              "incomplete", excluded from comparatives, Slack notified with which source
              and why. Never present a partial day as final (criteria #3).
  4. Trace  → knowledge.traceRefresh writes one row per (location, date) attempt, always —
              even when nothing loaded (invariant #4: never silently skip or fake a refresh).
  5. Done when → every active location has a trace row for the target date.

Brakes: this playbook only reads external sources and writes to our own warehouse — no
spend, no deletes, no customer-facing sends (spec #1 section 6: no sensitive actions here).
The Slack notification on an incomplete day is an internal ops alert, not a checkpoint.

New locations: adding credentials/config for nashville or mt_pleasant and flipping
`active: true` in config.yaml backfills and includes them with zero code changes
(criteria #4) — the loop only ever reads `activeLocations()` from config.

Escalation: if a scheduled run doesn't happen at all (the cron didn't fire), the
missed-refresh watchdog (`scripts/watchdog.ts`) alerts #ops within 30 minutes (criteria #6) —
that failure mode is "no trace row exists for today", which this playbook cannot detect
about itself.
