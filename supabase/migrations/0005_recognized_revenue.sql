-- CY360 Sales — recognized-revenue warehouse (Spec #1 v5, additive-only migration).
-- revenue_recognized holds the itemized CourtReserve revenuerecognition/list rows (the
-- report's actual source, spec section 3) mapped through packages/skills/courtreserve-ingest
-- ::mapRevenueRecognitionRows. business_line_map is the data-driven resolver behind
-- criterion #1 ("resolved through business_line_map, never hardcoded") — seeded with the
-- default rules in packages/skills/business-lines/index.ts so the dashboard has a mapping
-- from day one, editable by an admin from then on (criterion #4). alerts_sent is the
-- per-line-per-day dedupe ledger behind criterion #5 ("pushed to Slack at most once per day
-- per line").
--
-- THE SYSTEM SHALL NEVER store MemberFirstName/MemberLastName (dropped before persisting —
-- packages/skills/courtreserve-ingest/index.ts:mapRevenueRecognitionRows). `raw` is the
-- source row minus those two fields.

create table if not exists revenue_recognized (
  id             bigint generated always as identity primary key,
  location_slug  text not null references locations (slug),
  source         text not null check (source in ('courtreserve')),
  external_id    text not null, -- FeeId::PaymentId::RelationId, unique per recognized line
  period_month   text not null, -- YYYY-MM, derived from business_date
  business_date  date not null, -- date(StartDateTime) — service date, never payment date
  group_name     text not null, -- FeeCategory
  item_name      text not null, -- Description
  amount_cents   bigint not null, -- per config.report.recognition.tax_included
  tax_cents      bigint not null,
  net_cents      bigint not null, -- always tax-exclusive (Subtotal)
  transaction_type text,
  payment_type   text,
  recognized_on  date, -- PaidDate
  raw            jsonb not null default '{}', -- source row minus MemberFirstName/MemberLastName
  loaded_at      timestamptz not null default now(),
  unique (location_slug, external_id)
);
create index if not exists revenue_recognized_location_date_idx on revenue_recognized (location_slug, business_date);
create index if not exists revenue_recognized_location_month_idx on revenue_recognized (location_slug, period_month);

create table if not exists business_line_map (
  id            bigint generated always as identity primary key,
  source        text not null check (source in ('gotab', 'courtreserve')),
  match_group   text not null, -- ILIKE pattern against the source group name (e.g. FeeCategory)
  match_item    text, -- ILIKE pattern against the item name; null = matches any item in the group
  business_line text not null check (business_line in
    ('food_beverage','pickleball','memberships','events','lessons','swag','arcade','sponsorships')),
  priority      integer not null default 10, -- lower runs first
  created_at    timestamptz not null default now()
);
create index if not exists business_line_map_source_idx on business_line_map (source, priority);

create table if not exists alerts_sent (
  id             bigint generated always as identity primary key,
  location_slug  text not null references locations (slug),
  business_line  text not null,
  sent_on        date not null,
  direction      text not null check (direction in ('up', 'down')),
  comparison     text not null, -- 'prior_month' | 'same_month_last_year'
  pct            numeric not null,
  message        text not null,
  created_at     timestamptz not null default now(),
  unique (location_slug, business_line, sent_on)
);

alter table revenue_recognized enable row level security;
alter table business_line_map enable row level security;
alter table alerts_sent enable row level security;

-- Scoped read (invariant #1, same pattern as sales_transactions_scoped_read in 0004).
create policy revenue_recognized_scoped_read on revenue_recognized
  for select using (
    auth.role() = 'service_role'
    or exists (select 1 from manager_locations ml where ml.user_id = auth.uid() and ml.location_slug = revenue_recognized.location_slug)
  );
create policy revenue_recognized_service_write on revenue_recognized
  for insert with check (auth.role() = 'service_role');
create policy revenue_recognized_service_delete on revenue_recognized
  for delete using (auth.role() = 'service_role');

-- business_line_map has no per-location data — the mapping itself isn't sensitive, but
-- writes are still service-role only (invariant #5: assignment only via the admin route,
-- never a public write).
create policy business_line_map_read_all on business_line_map
  for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');
create policy business_line_map_service_write on business_line_map
  for insert with check (auth.role() = 'service_role');
create policy business_line_map_service_update on business_line_map
  for update using (auth.role() = 'service_role');

create policy alerts_sent_service_only on alerts_sent
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Seed the default rules (packages/skills/business-lines/index.ts::DEFAULT_BUSINESS_LINE_RULES)
-- so the resolver has a mapping from day one. Idempotent: skipped if any rows already exist,
-- so a re-run (or an admin's own edits) is never overwritten.
insert into business_line_map (source, match_group, match_item, business_line, priority)
select * from (values
  ('courtreserve', 'Membership Fee', null, 'memberships', 10),
  ('courtreserve', 'Event Registration', null, 'events', 10),
  ('courtreserve', 'Guest Fees - Events', null, 'events', 10),
  ('courtreserve', 'Reservation', null, 'pickleball', 10),
  ('courtreserve', 'Guest Fees - Reservations', null, 'pickleball', 10),
  ('courtreserve', 'Lesson', null, 'lessons', 10),
  ('courtreserve', 'Package', '%lesson%', 'lessons', 5),
  ('courtreserve', 'Package', '%pickleball%', 'pickleball', 5),
  ('courtreserve', 'Package', '%court%', 'pickleball', 5),
  ('gotab', 'food', null, 'food_beverage', 10),
  ('gotab', 'alcohol', null, 'food_beverage', 10),
  ('gotab', 'beverage', null, 'food_beverage', 10),
  ('gotab', 'swag', null, 'swag', 10),
  ('gotab', 'merchandise', null, 'swag', 10),
  ('gotab', 'arcade', null, 'arcade', 10),
  ('gotab', 'sponsorship', null, 'sponsorships', 10)
) as seed(source, match_group, match_item, business_line, priority)
where not exists (select 1 from business_line_map);
