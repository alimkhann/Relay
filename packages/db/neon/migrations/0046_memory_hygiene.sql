-- Memory Architecture v2 — memory hygiene worker columns.
-- Adds enrichment_status + enrichment_version to memory_items and observations
-- so the async worker can dedupe and re-run idempotently. Backfills existing
-- 604 memory_items to enrichment_status='done', enrichment_version=1 so the
-- first worker tick does not re-extract every legacy row.

alter table memory_items
  add column if not exists enrichment_status text default 'pending'
    check (enrichment_status in ('pending','running','done','failed')),
  add column if not exists enrichment_version int not null default 0,
  add column if not exists enrichment_error text,
  add column if not exists enriched_at timestamptz;

-- Existing rows already have embeddings + entity_mentions populated. Mark
-- them as enriched at the current pipeline version so the worker skips them.
update memory_items
set enrichment_status = 'done',
    enrichment_version = 1,
    enriched_at = coalesce(enriched_at, now())
where enrichment_status is null
   or enrichment_status = 'pending';

alter table memory_items
  alter column enrichment_status set not null;

-- Observations table is brand new (0042) so no backfill needed; default
-- 'pending' is correct for any future inserts from the worker.
alter table observations
  add column if not exists enrichment_status text default 'pending'
    check (enrichment_status in ('pending','running','done','failed')),
  add column if not exists enrichment_version int not null default 0,
  add column if not exists enrichment_error text,
  add column if not exists enriched_at timestamptz;

create index if not exists idx_memory_items_enrichment_pending
  on memory_items (space_id, enrichment_status, enrichment_version)
  where enrichment_status in ('pending','failed');

create index if not exists idx_observations_enrichment_pending
  on observations (space_id, enrichment_status, enrichment_version)
  where enrichment_status in ('pending','failed');

-- Half-life lookup table for the hygiene worker. Keyed by memory_item type;
-- defaults match the plan. Worker reads this on each tick so half-lives can
-- be tuned in prod without a code deploy.
create table if not exists memory_half_lives (
  item_type text primary key,
  half_life_days int not null,
  updated_at timestamptz not null default now()
);

insert into memory_half_lives (item_type, half_life_days) values
  ('decision',    180),
  ('constraint',  120),
  ('requirement',  90),
  ('task',         14),
  ('note',         60),
  ('artifact',    365),
  ('observation',  45)
on conflict (item_type) do nothing;

-- DOWN
-- drop table if exists memory_half_lives;
-- drop index if exists idx_observations_enrichment_pending;
-- drop index if exists idx_memory_items_enrichment_pending;
-- alter table observations
--   drop column if exists enriched_at,
--   drop column if exists enrichment_error,
--   drop column if exists enrichment_version,
--   drop column if exists enrichment_status;
-- alter table memory_items
--   drop column if exists enriched_at,
--   drop column if exists enrichment_error,
--   drop column if exists enrichment_version,
--   drop column if exists enrichment_status;
