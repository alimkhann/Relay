create table if not exists work_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  workspace_id text,
  surface text not null,
  thread_id text,
  agent_name text,
  client_name text,
  association_method text,
  association_confidence numeric,
  base_sync_mark_at timestamptz,
  latest_summary text,
  latest_structured_state jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_work_sessions_project_surface_status
  on work_sessions(project_id, surface, status, updated_at desc);

create index if not exists idx_work_sessions_user_project_updated
  on work_sessions(user_id, project_id, updated_at desc);

create table if not exists work_session_events (
  id uuid primary key default gen_random_uuid(),
  work_session_id uuid not null references work_sessions(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  source_surface text not null,
  source_url text,
  source_thread_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_work_session_events_session_created
  on work_session_events(work_session_id, created_at desc);

create index if not exists idx_work_session_events_project_created
  on work_session_events(project_id, created_at desc);

create table if not exists work_session_checkpoints (
  id uuid primary key default gen_random_uuid(),
  work_session_id uuid not null references work_sessions(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  summary_short text,
  structured_state jsonb not null default '{}'::jsonb,
  source_event_ids text[] not null default '{}'::text[],
  confidence numeric,
  created_at timestamptz not null default now()
);

create index if not exists idx_work_session_checkpoints_session_created
  on work_session_checkpoints(work_session_id, created_at desc);

create index if not exists idx_work_session_checkpoints_project_created
  on work_session_checkpoints(project_id, created_at desc);

alter table work_sessions enable row level security;
alter table work_session_events enable row level security;
alter table work_session_checkpoints enable row level security;

create policy "Users manage own work sessions"
on work_sessions
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());

create policy "Users manage own work session events"
on work_session_events
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());

create policy "Users manage own work session checkpoints"
on work_session_checkpoints
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());
