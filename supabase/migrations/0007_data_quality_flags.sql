-- CY360 Sales — data-quality guardrails (packages/core/dataQuality.ts).
--
-- The report's whole value proposition is trustworthy figures. This table is where every
-- automated suspicion about a day or month's numbers lands so it can never be silently
-- presented as final: an outlier vs. trailing history (warn), a day GoTab re-verification
-- couldn't confirm (error), or a month that contains any unresolved error (error) — the
-- signal the dashboard's honesty banner reads. Resolved only by an admin action
-- (/admin/data-quality), which stamps who and when; nothing here auto-resolves itself,
-- so a real fix always leaves a paper trail.
create table if not exists data_quality_flags (
  id             bigint generated always as identity primary key,
  location_slug  text not null references locations (slug),
  scope          text not null check (scope in ('day', 'month')),
  date           date,             -- set when scope = 'day'
  month          text,             -- YYYY-MM, set when scope = 'month'
  source         text check (source in ('gotab', 'courtreserve')),
  code           text not null check (code in ('outlier_day', 'unverified_day', 'month_unreliable')),
  severity       text not null check (severity in ('warn', 'error')),
  message        text not null,
  -- Computed in app code as `${location_slug}:${scope}:${date ?? month}:${code}:${source ?? '-'}`
  -- — the idempotency key: re-running the same check never creates a duplicate flag, and
  -- (criterion) never silently re-opens one an admin already resolved.
  dedupe_key     text not null unique,
  resolved       boolean not null default false,
  resolved_by    text,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists data_quality_flags_location_idx on data_quality_flags (location_slug, resolved);
create index if not exists data_quality_flags_month_idx on data_quality_flags (location_slug, month);

alter table data_quality_flags enable row level security;

-- Admin-only signal (same pattern as alerts_sent / gotab_day_verifications) — the dashboard's
-- honesty banner is served by the app's own API routes (service role), never a direct
-- browser-side Supabase read.
create policy data_quality_flags_service_only on data_quality_flags
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
