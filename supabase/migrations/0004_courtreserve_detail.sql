-- CY360 Sales — CourtReserve live API detail (spec #1 v2, section 10: verified contract,
-- tested live 2026-08-02). Transaction-level data alongside the existing daily_sales
-- aggregate — daily_sales/dashboard/metrics never change when sources.courtreserve.mode
-- flips between upload and api (section 2's architectural promise); this is the additional
-- detail the live API gives us that a CSV export doesn't.
--
-- PII: MemberFullName and FamilyName from the API are NEVER persisted anywhere below,
-- including inside `raw` (section 10: "SHALL NEVER store MemberFullName or FamilyName") —
-- packages/skills/courtreserve-ingest/index.ts strips them before this table is ever written.
-- OrgMemberId/OrgMemberFamilyId are opaque ids and may be kept (they stay inside `raw`).

create table if not exists sales_transactions (
  id             bigint generated always as identity primary key,
  location_slug  text not null references locations (slug),
  external_id    text not null, -- CourtReserve TransactionId
  business_date  date not null, -- date(PaidDate) — revenue recognized when paid
  occurred_at    timestamptz not null, -- PaidDate
  category       text,          -- FeeCategoryName
  item_name      text,          -- ItemName
  gross_cents    bigint not null,
  tax_cents      bigint not null default 0,
  net_cents      bigint not null default 0,
  payment_type   text,
  staff_name     text,          -- InstructorNames
  raw            jsonb not null default '{}', -- the row MINUS MemberFullName/FamilyName
  loaded_at      timestamptz not null default now(),
  unique (location_slug, external_id)
);
create index if not exists sales_transactions_location_date_idx on sales_transactions (location_slug, business_date);

create table if not exists court_reservations (
  id             bigint generated always as identity primary key,
  location_slug  text not null references locations (slug),
  reservation_id text not null,
  court_labels   text,
  court_ids      text,
  start_at       timestamptz,
  end_at         timestamptz,
  business_date  date not null,
  loaded_at      timestamptz not null default now(),
  unique (location_slug, reservation_id)
);
create index if not exists court_reservations_location_date_idx on court_reservations (location_slug, business_date);

create table if not exists payment_type_totals (
  location_slug     text not null references locations (slug),
  date              date not null,
  payment_type      text not null,
  gross_cents       bigint not null,
  transaction_count integer not null default 0,
  loaded_at         timestamptz not null default now(),
  primary key (location_slug, date, payment_type)
);

alter table sales_transactions enable row level security;
alter table court_reservations enable row level security;
alter table payment_type_totals enable row level security;

-- Same scoped-read / service-role-write shape as daily_sales (invariant #1) — PII is
-- already stripped before these rows exist, so a manager reading their own location's
-- detail is no different in kind from reading daily_sales.
create policy sales_transactions_scoped_read on sales_transactions
  for select using (
    auth.role() = 'service_role'
    or exists (select 1 from manager_locations ml where ml.user_id = auth.uid() and ml.location_slug = sales_transactions.location_slug)
  );
create policy sales_transactions_service_write on sales_transactions
  for insert with check (auth.role() = 'service_role');
create policy sales_transactions_service_update on sales_transactions
  for update using (auth.role() = 'service_role');

create policy court_reservations_scoped_read on court_reservations
  for select using (
    auth.role() = 'service_role'
    or exists (select 1 from manager_locations ml where ml.user_id = auth.uid() and ml.location_slug = court_reservations.location_slug)
  );
create policy court_reservations_service_write on court_reservations
  for insert with check (auth.role() = 'service_role');
create policy court_reservations_service_update on court_reservations
  for update using (auth.role() = 'service_role');

create policy payment_type_totals_scoped_read on payment_type_totals
  for select using (
    auth.role() = 'service_role'
    or exists (select 1 from manager_locations ml where ml.user_id = auth.uid() and ml.location_slug = payment_type_totals.location_slug)
  );
create policy payment_type_totals_service_write on payment_type_totals
  for insert with check (auth.role() = 'service_role');
create policy payment_type_totals_service_update on payment_type_totals
  for update using (auth.role() = 'service_role');
