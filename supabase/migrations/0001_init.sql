-- CY360 Sales — normalized warehouse + RLS (Spec #1).
-- Ingestion writes with the service role (bypasses RLS, read-only against GoTab/CourtReserve
-- themselves — this is OUR warehouse). Dashboard reads with the anon/authenticated role and
-- is scoped by these policies — enforcement lives in Postgres, not only in app code
-- (invariant #1: never show one location's data to another location's manager).

create table if not exists locations (
  slug        text primary key,
  name        text not null,
  active      boolean not null default false
);

-- Which manager (Supabase auth user) may see which location. A manager may cover more than one.
create table if not exists manager_locations (
  user_id        uuid not null references auth.users (id) on delete cascade,
  location_slug  text not null references locations (slug) on delete cascade,
  primary key (user_id, location_slug)
);

create table if not exists daily_sales (
  id                  bigint generated always as identity primary key,
  location_slug       text not null references locations (slug),
  date                date not null,
  source              text not null check (source in ('gotab', 'courtreserve')),
  gross_amount_cents  bigint not null,
  breakdown           jsonb not null default '{}',
  loaded_at           timestamptz not null default now(),
  unique (location_slug, date, source)
);
create index if not exists daily_sales_location_date_idx on daily_sales (location_slug, date);

-- One row per (location, date) refresh attempt — every run leaves a trace, pass or fail
-- (invariant #4: never silently skip or fake a refresh).
create table if not exists refresh_runs (
  id                    bigint generated always as identity primary key,
  location_slug         text not null references locations (slug),
  date                  date not null,
  at                    timestamptz not null default now(),
  gotab_status          text not null check (gotab_status in ('loaded', 'missing', 'error')),
  courtreserve_status   text not null check (courtreserve_status in ('loaded', 'missing', 'error')),
  status                text not null check (status in ('complete', 'incomplete')),
  error                 text
);
create index if not exists refresh_runs_location_date_idx on refresh_runs (location_slug, date, at desc);

alter table locations enable row level security;
alter table manager_locations enable row level security;
alter table daily_sales enable row level security;
alter table refresh_runs enable row level security;

-- Locations: every authenticated manager can see the (non-sensitive) list of locations,
-- to render location switchers etc. Activation state only, no financials here.
create policy locations_read_all on locations
  for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');

create policy manager_locations_read_own on manager_locations
  for select using (user_id = auth.uid() or auth.role() = 'service_role');

-- The core isolation rule: a manager only reads daily_sales rows for locations they're
-- mapped to. Ingestion (service_role) bypasses this to write for every active location.
create policy daily_sales_scoped_read on daily_sales
  for select using (
    auth.role() = 'service_role'
    or exists (
      select 1 from manager_locations ml
      where ml.user_id = auth.uid() and ml.location_slug = daily_sales.location_slug
    )
  );

create policy refresh_runs_scoped_read on refresh_runs
  for select using (
    auth.role() = 'service_role'
    or exists (
      select 1 from manager_locations ml
      where ml.user_id = auth.uid() and ml.location_slug = refresh_runs.location_slug
    )
  );

-- Writes: read-only ingestion only, only via the service role (invariant #3: never write to
-- the sources; this is our own warehouse, written once per day by the refresh loop).
create policy daily_sales_service_write on daily_sales
  for insert with check (auth.role() = 'service_role');
create policy daily_sales_service_update on daily_sales
  for update using (auth.role() = 'service_role');
create policy refresh_runs_service_write on refresh_runs
  for insert with check (auth.role() = 'service_role');

insert into locations (slug, name, active) values
  ('orlando', 'Crush Yard Orlando', true),
  ('nashville', 'Crush Yard Nashville', false),
  ('mt_pleasant', 'Crush Yard Mt. Pleasant', false)
on conflict (slug) do nothing;
