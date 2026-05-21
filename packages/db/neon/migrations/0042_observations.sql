-- Memory Architecture v2 — observations layer.
-- Bi-temporal extracted facts. Hybrid free-form + optional SVO triples.
-- Source episode and source memory item are nullable so observations can
-- originate from either an episode (extracted by the worker) or a canon
-- item (extracted later).

create table if not exists observations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  source_episode_id uuid references source_sessions(id) on delete set null,
  source_memory_item_id uuid references memory_items(id) on delete set null,
  content text not null,
  -- SVO fields are optional. When all three are filled the observation is
  -- entity-centric; otherwise it behaves as a free-form text fact.
  subject_entity_id uuid references canonical_entities(id) on delete set null,
  predicate text,
  object_entity_id uuid references canonical_entities(id) on delete set null,
  object_literal text,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  expired_at timestamptz,
  lifecycle_state text not null default 'active'
    check (lifecycle_state in ('active','cooling','archived','forgotten')),
  embedding vector(768),
  embedding_model text,
  search_vector tsvector generated always as (
    to_tsvector('english', coalesce(content, ''))
  ) stored,
  confidence numeric not null default 1.0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_observations_embedding
  on observations using hnsw (embedding vector_cosine_ops);

create index if not exists idx_observations_search_vector
  on observations using gin (search_vector);

create index if not exists idx_observations_space_valid_until
  on observations (space_id, valid_until);

create index if not exists idx_observations_space_lifecycle
  on observations (space_id, lifecycle_state);

create index if not exists idx_observations_svo
  on observations (subject_entity_id, predicate)
  where subject_entity_id is not null and predicate is not null;

create index if not exists idx_observations_source_memory
  on observations (source_memory_item_id)
  where source_memory_item_id is not null;

create index if not exists idx_observations_source_episode
  on observations (source_episode_id)
  where source_episode_id is not null;

alter table observations enable row level security;

drop policy if exists "Members read observations" on observations;
create policy "Members read observations" on observations
  for select
  using (public.is_space_member(space_id));

drop policy if exists "Members write observations" on observations;
create policy "Members write observations" on observations
  for all
  using (public.is_space_member(space_id))
  with check (public.is_space_member(space_id));

-- Extend memory_events.event_type CHECK to include the new event names that
-- observations + entity_relations + hygiene will emit. CHECK constraint, not
-- enum (verified at 0028_memory_events.sql:13).
alter table memory_events
  drop constraint if exists memory_events_event_type_check;

alter table memory_events
  add constraint memory_events_event_type_check
  check (
    event_type = any (array[
      -- existing values
      'created','updated','archived','reaffirmed','superseded','disputed','restored',
      -- new in v2
      'observation_created','observation_expired',
      'entity_relation_created','entity_relation_invalidated',
      'cooled','restored_auto','forgotten','obsoleted','decay_proposed'
    ])
  );

-- DOWN
-- alter table memory_events drop constraint if exists memory_events_event_type_check;
-- alter table memory_events add constraint memory_events_event_type_check
--   check (event_type in ('created','updated','archived','reaffirmed','superseded','disputed','restored'));
-- drop table if exists observations;
