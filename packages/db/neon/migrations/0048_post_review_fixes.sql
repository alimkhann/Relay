-- Memory Architecture v2 — post-review fixes.
-- Folds two corrections surfaced in PR #35 review:
--   A10. HNSW embedding indexes were non-partial, so the index walked rows
--        with NULL embeddings until the worker backfills them. Recreate as
--        partial (WHERE embedding IS NOT NULL).
--   A18. entity_mentions RLS (added in 0044) required space_id IS NOT NULL,
--        which would silently block legacy writers that don't set space_id.
--        Relax to dual-path (space-OR-project via the owning memory item),
--        matching canonical_entities.

-- A10 — partial HNSW indexes -------------------------------------------------

drop index if exists idx_observations_embedding;
create index if not exists idx_observations_embedding
  on observations using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

drop index if exists idx_memory_items_embedding;
create index if not exists idx_memory_items_embedding
  on memory_items using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- A18 — dual-path RLS on entity_mentions ------------------------------------
-- A row authorizes if the caller is a member of its space OR (for legacy rows
-- without space_id) a member of the owning memory item's project.

drop policy if exists "Members read entity_mentions" on entity_mentions;
create policy "Members read entity_mentions" on entity_mentions
  for select
  using (
    (space_id is not null and public.is_space_member(space_id))
    or exists (
      select 1 from memory_items mi
      where mi.id = entity_mentions.memory_item_id
        and mi.project_id is not null
        and public.is_project_member(mi.project_id)
    )
  );

drop policy if exists "Members write entity_mentions" on entity_mentions;
create policy "Members write entity_mentions" on entity_mentions
  for all
  using (
    (space_id is not null and public.is_space_member(space_id))
    or exists (
      select 1 from memory_items mi
      where mi.id = entity_mentions.memory_item_id
        and mi.project_id is not null
        and public.is_project_member(mi.project_id)
    )
  )
  with check (
    (space_id is not null and public.is_space_member(space_id))
    or exists (
      select 1 from memory_items mi
      where mi.id = entity_mentions.memory_item_id
        and mi.project_id is not null
        and public.is_project_member(mi.project_id)
    )
  );

-- DOWN
-- -- Revert entity_mentions policies to the space-only form from 0044.
-- drop policy if exists "Members write entity_mentions" on entity_mentions;
-- create policy "Members write entity_mentions" on entity_mentions
--   for all
--   using (space_id is not null and public.is_space_member(space_id))
--   with check (space_id is not null and public.is_space_member(space_id));
-- drop policy if exists "Members read entity_mentions" on entity_mentions;
-- create policy "Members read entity_mentions" on entity_mentions
--   for select
--   using (space_id is not null and public.is_space_member(space_id));
-- -- Revert HNSW indexes to non-partial.
-- drop index if exists idx_memory_items_embedding;
-- create index if not exists idx_memory_items_embedding
--   on memory_items using hnsw (embedding vector_cosine_ops);
-- drop index if exists idx_observations_embedding;
-- create index if not exists idx_observations_embedding
--   on observations using hnsw (embedding vector_cosine_ops);
