-- CY360 Sales — admin accounts (Spec #1 v2, criterion #7: managers are provisioned by an
-- admin; there is no public self-service signup). Separate from `managers` because an admin
-- isn't scoped to one location — they provision managers and upload source data for any
-- active location. Rows are written/read exclusively by the app server via the service role
-- (packages/knowledge/admins.ts); RLS denies all other access (defense in depth, invariant #5:
-- never expose the upload or admin pages to a non-admin session).

create table if not exists admins (
  id             uuid primary key,
  email          text not null unique,
  password_hash  text not null,
  created_at     timestamptz not null default now()
);

alter table admins enable row level security;

create policy admins_service_only on admins
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Raw-file audit trail for confirmed uploads (criterion #2: store the raw file; invariant #4:
-- never accept an upload without a trace row AND a raw-file copy). The trace row itself
-- reuses refresh_runs (0001_init.sql) — it already has the exact (location, date,
-- gotab_status, courtreserve_status, status) shape criterion #2 asks for, written by the
-- import confirm handler instead of only a cron. This table is the raw-file half.
create table if not exists import_uploads (
  id                bigint generated always as identity primary key,
  location_slug     text not null references locations (slug),
  source             text not null check (source in ('gotab', 'courtreserve')),
  date              date not null,
  storage_path      text not null,
  original_filename text not null,
  uploaded_by       uuid,
  uploaded_at       timestamptz not null default now()
);
create index if not exists import_uploads_location_date_idx on import_uploads (location_slug, date);

alter table import_uploads enable row level security;

create policy import_uploads_service_only on import_uploads
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
