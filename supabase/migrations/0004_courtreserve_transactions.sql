-- CY360 Sales — CourtReserve API detail tables (Spec #1 section 10, verified live 2026-08-02).
-- Additive to daily_sales, not a replacement: daily_sales stays the aggregate the dashboard
-- and metrics read (spec section 2: "nothing about the warehouse, dashboard or metrics
-- changes when [the mode] flips"); these three tables hold the itemized detail behind that
-- aggregate for reconciliation (success metric: totals within 1% of the source report, side
-- by side) and future itemization. Written only by the service role, deleted+reinserted per
-- (location, date-range) on every refresh/backfill — idempotent by construction, never a
-- raw duplicate INSERT (packages/knowledge/courtreserve.ts).
--
-- THE SYSTEM SHALL NEVER store MemberFullName or FamilyName (dropped before persisting —
-- see packages/skills/courtreserve-ingest/index.ts:mapDetailedRowToTransaction). `raw` is
-- the source row minus those two fields.

create table if not exists sales_transactions (
  id             bigint generated always as identity primary key,
  location_slug  text not null references locations (slug),
  external_id    text not null, -- CourtReserve TransactionId
  business_date  date not null, -- date(PaidDate) — revenue recognized when paid
  occurred_at    timestamptz not null, -- PaidDate
  category       text not null, -- FeeCategoryName
  item_name      text not null, -- ItemName
  gross_cents    bigint not null, -- round(Amount * 100)
  tax_cents      bigint not null, -- round(TaxTotal * 100)
  net_cents      bigint not null, -- round(AmountWithNoTax * 100)
  payment_type   text,
  staff_name     text, -- InstructorNames
  raw            jsonb not null default '{}', -- source row minus MemberFullName/FamilyName
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
  id                bigint generated always as identity primary key,
  location_slug     text not null references locations (slug),
  date              date not null,
  payment_type      text not null,
  gross_cents       bigint not null,
  transaction_count integer not null,
  loaded_at         timestamptz not null default now(),
  unique (location_slug, date, payment_type)
);
create index if not exists payment_type_totals_location_date_idx on payment_type_totals (location_slug, date);

alter table sales_transactions enable row level security;
alter table court_reservations enable row level security;
alter table payment_type_totals enable row level security;

-- Scoped read (invariant #1, same pattern as daily_sales_scoped_read in 0001_init.sql).
create policy sales_transactions_scoped_read on sales_transactions
  for select using (
    auth.role() = 'service_role'
    or exists (select 1 from manager_locations ml where ml.user_id = auth.uid() and ml.location_slug = sales_transactions.location_slug)
  );
create policy court_reservations_scoped_read on court_reservations
  for select using (
    auth.role() = 'service_role'
    or exists (select 1 from manager_locations ml where ml.user_id = auth.uid() and ml.location_slug = court_reservations.location_slug)
  );
create policy payment_type_totals_scoped_read on payment_type_totals
  for select using (
    auth.role() = 'service_role'
    or exists (select 1 from manager_locations ml where ml.user_id = auth.uid() and ml.location_slug = payment_type_totals.location_slug)
  );

-- Writes: service role only (ingestion), insert + delete (the replace-on-refresh idempotency
-- strategy needs both — never an update, so a partial row can never linger half-written).
create policy sales_transactions_service_write on sales_transactions
  for insert with check (auth.role() = 'service_role');
create policy sales_transactions_service_delete on sales_transactions
  for delete using (auth.role() = 'service_role');
create policy court_reservations_service_write on court_reservations
  for insert with check (auth.role() = 'service_role');
create policy court_reservations_service_delete on court_reservations
  for delete using (auth.role() = 'service_role');
create policy payment_type_totals_service_write on payment_type_totals
  for insert with check (auth.role() = 'service_role');
create policy payment_type_totals_service_delete on payment_type_totals
  for delete using (auth.role() = 'service_role');
