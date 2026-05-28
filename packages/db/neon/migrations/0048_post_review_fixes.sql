-- Memory Architecture v2 — post-review fixes.
-- A10. HNSW embedding indexes were non-partial, so the index walked rows with
--      NULL embeddings until the worker backfills them. Recreate as partial
--      (WHERE embedding IS NOT NULL).
-- (The original A18 entity_mentions RLS relaxation is gone — entity_mentions
-- RLS now lives in 0044_entity_rls.sql, keyed purely on project_id.)

-- A10 — partial HNSW indexes -------------------------------------------------

drop index if exists idx_observations_embedding;
create index if not exists idx_observations_embedding
  on observations using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

drop index if exists idx_memory_items_embedding;
create index if not exists idx_memory_items_embedding
  on memory_items using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- DOWN
-- -- Revert HNSW indexes to non-partial.
-- drop index if exists idx_memory_items_embedding;
-- create index if not exists idx_memory_items_embedding
--   on memory_items using hnsw (embedding vector_cosine_ops);
-- drop index if exists idx_observations_embedding;
-- create index if not exists idx_observations_embedding
--   on observations using hnsw (embedding vector_cosine_ops);
