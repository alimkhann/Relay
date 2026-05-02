alter table source_sessions
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text references profiles(id) on delete set null;

create index if not exists idx_source_sessions_project_active_captured_at
  on source_sessions(project_id, is_archived, captured_at desc);

create table if not exists project_state_overrides (
  project_id uuid primary key references projects(id) on delete cascade,
  project_overview_override text,
  current_objective_override text,
  recent_progress_override text,
  hidden_decisions jsonb not null default '[]'::jsonb,
  hidden_constraints jsonb not null default '[]'::jsonb,
  hidden_open_tasks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table project_state_overrides enable row level security;

create policy "Members manage project state overrides"
on project_state_overrides
for all
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));
