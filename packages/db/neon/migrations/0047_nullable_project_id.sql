-- Memory Architecture v2 — make project_id nullable where space_id is the new primary scope.
--
-- Personal-space rows do not belong to any project. The 6 memory-bearing
-- tables have NOT NULL project_id today; this migration relaxes that. RLS
-- policies are already dual-path (space-OR-project) per 0044, so dropping
-- the NOT NULL does not open new access paths.
--
-- Tables touched: memory_items, canonical_entities, source_sessions,
-- bootstrap_packets, memory_events, project_sources.

alter table memory_items        alter column project_id drop not null;
alter table canonical_entities  alter column project_id drop not null;
alter table source_sessions     alter column project_id drop not null;
alter table bootstrap_packets   alter column project_id drop not null;
alter table memory_events       alter column project_id drop not null;
alter table project_sources     alter column project_id drop not null;

-- New CHECK constraints: every row must point at either a space or a
-- project (or both, for legacy project-space rows during the cutover).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'memory_items_scope_check') then
    alter table memory_items
      add constraint memory_items_scope_check
      check (space_id is not null or project_id is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'canonical_entities_scope_check') then
    alter table canonical_entities
      add constraint canonical_entities_scope_check
      check (space_id is not null or project_id is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'source_sessions_scope_check') then
    alter table source_sessions
      add constraint source_sessions_scope_check
      check (space_id is not null or project_id is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bootstrap_packets_scope_check') then
    alter table bootstrap_packets
      add constraint bootstrap_packets_scope_check
      check (space_id is not null or project_id is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'memory_events_scope_check') then
    alter table memory_events
      add constraint memory_events_scope_check
      check (space_id is not null or project_id is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_sources_scope_check') then
    alter table project_sources
      add constraint project_sources_scope_check
      check (space_id is not null or project_id is not null);
  end if;
end$$;

-- DOWN
-- alter table memory_items        alter column project_id set not null;
-- alter table canonical_entities  alter column project_id set not null;
-- alter table source_sessions     alter column project_id set not null;
-- alter table bootstrap_packets   alter column project_id set not null;
-- alter table memory_events       alter column project_id set not null;
-- alter table project_sources     alter column project_id set not null;
-- alter table memory_items        drop constraint if exists memory_items_scope_check;
-- alter table canonical_entities  drop constraint if exists canonical_entities_scope_check;
-- alter table source_sessions     drop constraint if exists source_sessions_scope_check;
-- alter table bootstrap_packets   drop constraint if exists bootstrap_packets_scope_check;
-- alter table memory_events       drop constraint if exists memory_events_scope_check;
-- alter table project_sources     drop constraint if exists project_sources_scope_check;
