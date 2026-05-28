-- Memory Architecture v2 — RLS for canonical_entities + entity_mentions.
-- These two tables shipped (0036) with no row-level security — a real gap.
-- Key them on is_project_member(project_id). entity_mentions has no project_id
-- of its own, so it authorizes via the owning memory_item's project.
-- (The original 0044 also mirrored space_id onto several tables; that layer is
-- dropped — project_id is the single scope.)

alter table canonical_entities enable row level security;

drop policy if exists "Members read canonical_entities" on canonical_entities;
create policy "Members read canonical_entities" on canonical_entities
  for select
  using (public.is_project_member(project_id));

drop policy if exists "Members write canonical_entities" on canonical_entities;
create policy "Members write canonical_entities" on canonical_entities
  for all
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

alter table entity_mentions enable row level security;

drop policy if exists "Members read entity_mentions" on entity_mentions;
create policy "Members read entity_mentions" on entity_mentions
  for select
  using (
    exists (
      select 1 from memory_items mi
      where mi.id = entity_mentions.memory_item_id
        and public.is_project_member(mi.project_id)
    )
  );

drop policy if exists "Members write entity_mentions" on entity_mentions;
create policy "Members write entity_mentions" on entity_mentions
  for all
  using (
    exists (
      select 1 from memory_items mi
      where mi.id = entity_mentions.memory_item_id
        and public.is_project_member(mi.project_id)
    )
  )
  with check (
    exists (
      select 1 from memory_items mi
      where mi.id = entity_mentions.memory_item_id
        and public.is_project_member(mi.project_id)
    )
  );

-- DOWN
-- drop policy if exists "Members write entity_mentions" on entity_mentions;
-- drop policy if exists "Members read entity_mentions" on entity_mentions;
-- alter table entity_mentions disable row level security;
-- drop policy if exists "Members write canonical_entities" on canonical_entities;
-- drop policy if exists "Members read canonical_entities" on canonical_entities;
-- alter table canonical_entities disable row level security;
