create table if not exists canon_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null check (
    kind in (
      'objective',
      'decision',
      'constraint',
      'task',
      'progress',
      'artifact',
      'architecture_fact',
      'risk',
      'assumption',
      'question'
    )
  ),
  title text,
  content text not null,
  status text not null default 'active' check (
    status in ('active', 'tentative', 'superseded', 'disputed', 'stale', 'resolved')
  ),
  confidence numeric(4, 3) not null default 0.5,
  locked_by_user boolean not null default false,
  auto_generated boolean not null default false,
  valid_from timestamptz,
  valid_until timestamptz,
  last_verified_at timestamptz,
  supersedes_entry_id uuid references canon_entries(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by text not null references profiles(id) on delete cascade,
  updated_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists canon_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  canon_entry_id uuid not null references canon_entries(id) on delete cascade,
  source_kind text not null check (
    source_kind in ('memory_item', 'source_turn', 'session_digest', 'work_session', 'artifact', 'url', 'manual')
  ),
  source_id text not null,
  excerpt text,
  weight numeric(4, 3) not null default 0.5,
  created_at timestamptz not null default now()
);

create table if not exists project_summary_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null check (
    kind in ('session_summary', 'project_summary', 'current_focus_summary')
  ),
  content text not null,
  derived_from jsonb not null default '[]'::jsonb,
  generation_metadata jsonb not null default '{}'::jsonb,
  created_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_canon_entries_project_kind_status_updated
  on canon_entries (project_id, kind, status, updated_at desc);

create index if not exists idx_canon_entries_project_locked_updated
  on canon_entries (project_id, locked_by_user desc, updated_at desc);

create index if not exists idx_canon_evidence_entry_created
  on canon_evidence (canon_entry_id, created_at asc);

create index if not exists idx_project_summary_snapshots_project_kind_created
  on project_summary_snapshots (project_id, kind, created_at desc);

alter table canon_entries enable row level security;
alter table canon_evidence enable row level security;
alter table project_summary_snapshots enable row level security;

create policy "Members manage canon entries"
on canon_entries
for all
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

create policy "Members manage canon evidence"
on canon_evidence
for all
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

create policy "Members manage project summary snapshots"
on project_summary_snapshots
for all
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));
