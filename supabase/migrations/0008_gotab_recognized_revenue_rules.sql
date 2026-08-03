-- GoTab revenue now also lands directly in revenue_recognized (verified live 2026-08-02+),
-- in one of two grains per month — never both for the same month:
--   group_name = 'Categories'    — exploded per-category rows (e.g. 2026-07)
--   group_name = 'Business Lines' — pre-aggregated rows, item_name already the business line
-- Neither grain had a rule in business_line_map, so every GoTab dollar for an affected month
-- fell through to Unmapped (the resolver never got a chance to see it). This backfills the
-- missing rules and a general catch-all, exactly matching the resolver's SQL semantic:
--   where m.source = r.source
--     and (m.match_group is null or m.match_group = r.group_name)
--     and (m.match_item  is null or r.item_name ILIKE m.match_item)
--   order by m.priority limit 1
-- A catch-all needs match_group to be NULL ("matches any group"), which the original schema
-- didn't allow.
alter table business_line_map alter column match_group drop not null;

-- Idempotent per row (NOT EXISTS, not the blanket "table is empty" guard 0005 used) — the
-- table already has rows in every deployed environment, so a blanket guard would never fire
-- again; every row below is skipped individually if it already exists, so a re-run or an
-- admin's own edits are never duplicated or overwritten.
insert into business_line_map (source, match_group, match_item, business_line, priority)
select v.source, v.match_group, v.match_item, v.business_line, v.priority
from (values
  ('gotab', 'Categories', 'food', 'food_beverage', 10),
  ('gotab', 'Categories', 'alcohol', 'food_beverage', 10),
  ('gotab', 'Categories', 'beverage', 'food_beverage', 10),
  ('gotab', 'Categories', 'swag', 'swag', 10),
  ('gotab', 'Categories', 'merchandise', 'swag', 10),
  ('gotab', 'Categories', 'arcade', 'arcade', 10),
  ('gotab', 'Categories', 'sponsorship', 'sponsorships', 10),
  ('gotab', 'Categories', 'events', 'events', 10),
  ('gotab', 'Business Lines', 'food_beverage', 'food_beverage', 10),
  ('gotab', 'Business Lines', 'pickleball', 'pickleball', 10),
  ('gotab', 'Business Lines', 'memberships', 'memberships', 10),
  ('gotab', 'Business Lines', 'events', 'events', 10),
  ('gotab', 'Business Lines', 'lessons', 'lessons', 10),
  ('gotab', 'Business Lines', 'swag', 'swag', 10),
  ('gotab', 'Business Lines', 'arcade', 'arcade', 10),
  ('gotab', 'Business Lines', 'sponsorships', 'sponsorships', 10),
  ('gotab', null, '%', 'food_beverage', 100)
) as v(source, match_group, match_item, business_line, priority)
where not exists (
  select 1 from business_line_map m
  where m.source = v.source
    and m.match_group is not distinct from v.match_group
    and m.match_item is not distinct from v.match_item
);
