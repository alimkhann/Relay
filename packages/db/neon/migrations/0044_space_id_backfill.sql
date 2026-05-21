-- Memory Architecture v2 — backfill space_id on remaining memory-bearing tables.
-- Adds RLS to canonical_entities + entity_mentions (currently have no RLS).
-- project_id stays populated everywhere for the back-compat cutover week.

-- canonical_entities
alter table canonical_entities
  add column if not exists space_id uuid references spaces(id) on delete cascade;

update canonical_entities ce
set space_id = s.id
from spaces s
where s.project_id = ce.project_id
  and s.kind = 'project'
  and ce.space_id is null;

create index if not exists idx_canonical_entities_space on canonical_entities(space_id);

alter table canonical_entities enable row level security;

drop policy if exists "Members read canonical_entities" on canonical_entities;
create policy "Members read canonical_entities" on canonical_entities
  for select
  using (
    -- New space-based path. Dual-path with the legacy project-based check
    -- so existing callers without space_id resolution still authorize.
    (space_id is not null and public.is_space_member(space_id))
    or (project_id is not null and public.is_project_member(project_id))
  );

drop policy if exists "Members write canonical_entities" on canonical_entities;
create policy "Members write canonical_entities" on canonical_entities
  for all
  using (
    (space_id is not null and public.is_space_member(space_id))
    or (project_id is not null and public.is_project_member(project_id))
  )
  with check (
    (space_id is not null and public.is_space_member(space_id))
    or (project_id is not null and public.is_project_member(project_id))
  );

-- entity_mentions — no project_id column, backfill via memory_items join.
alter table entity_mentions
  add column if not exists space_id uuid references spaces(id) on delete cascade;

update entity_mentions em
set space_id = mi.space_id
from memory_items mi
where mi.id = em.memory_item_id
  and em.space_id is null;

create index if not exists idx_entity_mentions_space on entity_mentions(space_id);

alter table entity_mentions enable row level security;

drop policy if exists "Members read entity_mentions" on entity_mentions;
create policy "Members read entity_mentions" on entity_mentions
  for select
  using (
    space_id is not null and public.is_space_member(space_id)
  );

drop policy if exists "Members write entity_mentions" on entity_mentions;
create policy "Members write entity_mentions" on entity_mentions
  for all
  using (
    space_id is not null and public.is_space_member(space_id)
  )
  with check (
    space_id is not null and public.is_space_member(space_id)
  );

-- source_sessions (existing RLS keyed off project_members; add space_id and
-- keep dual-path until the consolidation PR).
alter table source_sessions
  add column if not exists space_id uuid references spaces(id) on delete cascade;

update source_sessions ss
set space_id = s.id
from spaces s
where s.project_id = ss.project_id
  and s.kind = 'project'
  and ss.space_id is null;

create index if not exists idx_source_sessions_space on source_sessions(space_id);

-- bootstrap_packets
alter table bootstrap_packets
  add column if not exists space_id uuid references spaces(id) on delete cascade;

update bootstrap_packets bp
set space_id = s.id
from spaces s
where s.project_id = bp.project_id
  and s.kind = 'project'
  and bp.space_id is null;

create index if not exists idx_bootstrap_packets_space on bootstrap_packets(space_id);

-- memory_events
alter table memory_events
  add column if not exists space_id uuid references spaces(id) on delete cascade;

update memory_events me
set space_id = s.id
from spaces s
where s.project_id = me.project_id
  and s.kind = 'project'
  and me.space_id is null;

create index if not exists idx_memory_events_space on memory_events(space_id);

-- project_sources (actual table name; "sources" in the plan was shorthand).
alter table project_sources
  add column if not exists space_id uuid references spaces(id) on delete cascade;

update project_sources ps
set space_id = s.id
from spaces s
where s.project_id = ps.project_id
  and s.kind = 'project'
  and ps.space_id is null;

create index if not exists idx_project_sources_space on project_sources(space_id);

-- DOWN
-- drop policy if exists "Members write entity_mentions" on entity_mentions;
-- drop policy if exists "Members read entity_mentions" on entity_mentions;
-- alter table entity_mentions disable row level security;
-- drop policy if exists "Members write canonical_entities" on canonical_entities;
-- drop policy if exists "Members read canonical_entities" on canonical_entities;
-- alter table canonical_entities disable row level security;
-- alter table project_sources    drop column if exists space_id;
-- alter table memory_events      drop column if exists space_id;
-- alter table bootstrap_packets  drop column if exists space_id;
-- alter table source_sessions    drop column if exists space_id;
-- alter table entity_mentions    drop column if exists space_id;
-- alter table canonical_entities drop column if exists space_id;
