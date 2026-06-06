-- Composite indexes for hygiene decay scans and hot listByProject paths.
-- Without these, the hygiene worker does a full project-scoped seq-scan per
-- project per tick and listByProject (personal dedup + memory list) lacks a
-- selective active-only pre-filter.

-- For lifecycle decay scans: hygiene queries project_id + lifecycle_state
-- ordered by updated_at. Partial (excluding 'forgotten') keeps the index small
-- since forgotten items are terminal and never re-processed.
create index if not exists idx_memory_items_project_lifecycle_updated
  on memory_items (project_id, lifecycle_state, updated_at desc)
  where lifecycle_state != 'forgotten';

-- For listByProject active-only path (personal dedup + memory tab reads).
-- More selective than the existing idx_memory_items_project_type_pinned_active
-- because the partial predicate eliminates archived rows from the index entirely.
create index if not exists idx_memory_items_project_active
  on memory_items (project_id, updated_at desc)
  where is_archived = false;

-- Note: 0047 was intentionally skipped; migration runner uses lexicographic
-- sort so gaps are fine.

-- DOWN
-- drop index if exists idx_memory_items_project_active;
-- drop index if exists idx_memory_items_project_lifecycle_updated;
