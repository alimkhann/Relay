-- Memory Architecture v2 — worker pickup index covers ORDER BY created_at.
--
-- The tick() pickup query is
--   SELECT id FROM memory_items
--   WHERE enrichment_status IN ('pending','failed')
--     AND enrichment_version < $2
--   ORDER BY created_at ASC LIMIT $1
-- The partial index from 0046 keyed on (project_id, enrichment_status,
-- enrichment_version) does not cover the ORDER BY, so on prod-sized backlogs
-- (700+ pending after the 0049 backfill flip) the planner falls back to an
-- in-memory sort. Recreate the partial index with created_at appended so the
-- index can serve both the filter and the ordering.

drop index if exists idx_memory_items_enrichment_pending;
create index if not exists idx_memory_items_enrichment_pending
  on memory_items (enrichment_status, enrichment_version, created_at)
  where enrichment_status in ('pending','failed');

create index if not exists idx_memory_items_embedding_missing_pickup
  on memory_items (created_at)
  where enrichment_status in ('pending','failed') and embedding is null;

-- DOWN
-- drop index if exists idx_memory_items_enrichment_pending;
-- create index if not exists idx_memory_items_enrichment_pending
--   on memory_items (project_id, enrichment_status, enrichment_version)
--   where enrichment_status in ('pending','failed');
