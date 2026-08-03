-- CY360 Sales — GoTab day re-verification ledger (data-integrity incident response).
--
-- Root cause (confirmed): the original backfill navigated GoTab's sales page day by day and
-- waited only for the text "Gross Sales" to be present before parsing. GoTab renders that
-- page with client-side JavaScript, so on a slow render the label was already on screen from
-- the PREVIOUS day, and the script parsed stale numbers under the new day's date. 13 of 583
-- days ended up more than 4x their trailing median. scripts/gotab-verify.ts re-visits every
-- day, asserts the page's OWN displayed date matches the requested date before parsing
-- anything, and records the outcome here — see docs/ingestion-recipes.md.
--
-- One row per (location, date), overwritten on every re-check (idempotent, resumable).
create table if not exists gotab_day_verifications (
  id                  bigint generated always as identity primary key,
  location_slug       text not null references locations (slug),
  date                date not null,
  stored_cents        bigint,           -- daily_sales.gross_amount_cents (source=gotab) before this check
  observed_cents      bigint,           -- what the page actually showed; null when unreadable/mismatch
  observed_breakdown  jsonb,            -- discounts/comps/net/tax/tips/external_payouts/tabs, when parsed
  page_date_shown     text,             -- the period label text the page rendered, for audit
  status              text not null check (status in ('ok', 'corrected', 'mismatch', 'unreadable', 'no_sales')),
  note                text,
  checked_at          timestamptz not null default now(),
  unique (location_slug, date)
);
create index if not exists gotab_day_verifications_location_date_idx on gotab_day_verifications (location_slug, date);

alter table gotab_day_verifications enable row level security;

-- Internal ops ledger, not customer/manager facing — service role only (same pattern as
-- alerts_sent in 0005_recognized_revenue.sql).
create policy gotab_day_verifications_service_only on gotab_day_verifications
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
