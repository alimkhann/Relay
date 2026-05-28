-- Memory Architecture v2 — entity_relations.
-- Typed entity<->entity edges with bi-temporal validity. Recursive CTE
-- traversal lives in app code (packages/db/src/repositories/graph-repository.ts).

create table if not exists entity_relations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  source_entity_id uuid not null references canonical_entities(id) on delete cascade,
  target_entity_id uuid not null references canonical_entities(id) on delete cascade,
  relation_type text not null,
  confidence numeric not null default 1.0,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  expired_at timestamptz,
  lifecycle_state text not null default 'active'
    check (lifecycle_state in ('active','cooling','archived','forgotten')),
  -- Where this edge was inferred from (an observation, a memory_item, or
  -- both). Both nullable so worker-inferred edges without a single source
  -- still fit.
  source_observation_id uuid references observations(id) on delete set null,
  source_memory_item_id uuid references memory_items(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (source_entity_id <> target_entity_id)
);

create index if not exists idx_entity_relations_project_valid_until
  on entity_relations (project_id, valid_until);

create index if not exists idx_entity_relations_source
  on entity_relations (source_entity_id);

create index if not exists idx_entity_relations_target
  on entity_relations (target_entity_id);

create index if not exists idx_entity_relations_project_lifecycle
  on entity_relations (project_id, lifecycle_state);

-- One current edge per (source, target, relation_type) at any given time.
-- Multiple historical edges remain valid via valid_until being non-null.
create unique index if not exists idx_entity_relations_current_unique
  on entity_relations (source_entity_id, target_entity_id, relation_type)
  where valid_until is null;

alter table entity_relations enable row level security;

drop policy if exists "Members read entity_relations" on entity_relations;
create policy "Members read entity_relations" on entity_relations
  for select
  using (public.is_project_member(project_id));

drop policy if exists "Members write entity_relations" on entity_relations;
create policy "Members write entity_relations" on entity_relations
  for all
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

-- DOWN
-- drop table if exists entity_relations;
