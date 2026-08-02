-- CY360 Sales — manager accounts (email + password), one location per manager.
-- Real credential auth for spec #1 section 2 ("manager opens their location's dashboard") —
-- replaces the earlier location-picker-only login. Rows are written/read exclusively by the
-- app server via the service role (packages/knowledge/managers.ts); no client ever talks to
-- this table directly, so RLS denies all access except service_role (defense in depth,
-- invariant #2: never store/log source credentials — this table only ever holds our own
-- manager accounts' hashed passwords, never GoTab/CourtReserve credentials).

create table if not exists managers (
  id             uuid primary key,
  email          text not null unique,
  password_hash  text not null,
  location_slug  text not null references locations (slug),
  created_at     timestamptz not null default now()
);
create index if not exists managers_location_idx on managers (location_slug);

alter table managers enable row level security;

create policy managers_service_only on managers
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
