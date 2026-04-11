-- Phase 4 — F1: memory_events audit stream.
--
-- Replayable, per-mutation log of memory_item activity. Powers the
-- cross-surface drift reconciler (detects when extension + MCP write
-- contradictory facts on the same topic within a short window) and, later,
-- general replay/audit use cases.

create table if not exists memory_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  memory_item_id uuid references memory_items(id) on delete set null,
  event_type text not null check (
    event_type in ('created', 'updated', 'archived', 'reaffirmed', 'superseded', 'disputed', 'restored')
  ),
  source_surface text,
  user_id text references profiles(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_memory_events_project_created
  on memory_events (project_id, created_at desc);

create index if not exists idx_memory_events_memory_item
  on memory_events (memory_item_id)
  where memory_item_id is not null;

create index if not exists idx_memory_events_project_type_created
  on memory_events (project_id, event_type, created_at desc);

-- RLS: accessible if the caller owns the project (same pattern as memory_relations).
alter table memory_events enable row level security;

drop policy if exists memory_events_viewer_policy on memory_events;
create policy memory_events_viewer_policy on memory_events
  for all
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = memory_events.project_id
        and pm.user_id = current_setting('relay.current_user_id', true)
    )
  );
