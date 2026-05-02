alter table source_sessions
  add column if not exists capture_signature text;

create index if not exists idx_source_sessions_project_capture_signature
  on source_sessions(project_id, capture_signature, captured_at desc);

create table if not exists session_digests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  source_session_id uuid not null references source_sessions(id) on delete cascade,
  source_signature text not null,
  summary_short text not null,
  structured_digest jsonb not null default '{}'::jsonb,
  confidence numeric(4, 3) not null default 0,
  importance_score integer not null default 0,
  needs_project_state_merge boolean not null default true,
  merged_at timestamptz,
  created_by text not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (source_session_id)
);

create table if not exists project_state (
  project_id uuid primary key references projects(id) on delete cascade,
  project_overview text,
  current_objective text,
  stack_domain text,
  recent_progress text,
  decisions jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  open_tasks jsonb not null default '[]'::jsonb,
  relevant_tools jsonb not null default '[]'::jsonb,
  last_bootstrap_at timestamptz,
  dirty boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bootstrap_packets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  target_profile_id uuid not null references target_profiles(id) on delete restrict,
  kind text not null,
  content text not null,
  structured_snapshot jsonb not null default '{}'::jsonb,
  renderer text not null,
  generation_metadata jsonb not null default '{}'::jsonb,
  created_by text not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists ai_job_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  session_id uuid references source_sessions(id) on delete cascade,
  created_by text not null references profiles(id) on delete cascade,
  job_kind text not null,
  status text not null default 'pending',
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  primary_model text,
  actual_model text,
  fallback_used boolean not null default false,
  token_usage jsonb not null default '{}'::jsonb,
  error_class text,
  error_message text,
  attempts integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists extension_connect_grants (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references profiles(id) on delete cascade,
  device_name text not null,
  grant_hash text not null unique,
  grant_prefix text not null,
  api_base text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_session_digests_project_created_at
  on session_digests(project_id, created_at desc);

create index if not exists idx_bootstrap_packets_project_created_at
  on bootstrap_packets(project_id, created_at desc);

create index if not exists idx_ai_job_runs_project_status_created_at
  on ai_job_runs(project_id, status, created_at asc);

create index if not exists idx_extension_connect_grants_user_created_at
  on extension_connect_grants(user_id, created_at desc);

alter table session_digests enable row level security;
alter table project_state enable row level security;
alter table bootstrap_packets enable row level security;
alter table ai_job_runs enable row level security;
alter table extension_connect_grants enable row level security;

create policy "Members manage session digests"
on session_digests
for all
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

create policy "Members manage project state"
on project_state
for all
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

create policy "Members manage bootstrap packets"
on bootstrap_packets
for all
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

create policy "Members manage ai jobs"
on ai_job_runs
for all
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

create policy "Users manage own connect grants"
on extension_connect_grants
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());
