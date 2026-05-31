-- Memory Architecture v2 — multi-project capture (shared session).
-- A captured chat (source_sessions row) can be linked to MORE THAN ONE project
-- so each project's digest extracts the facts that matter to IT from the same
-- transcript. The session keeps its single origin project_id (the project the
-- capture was created under); this join table records every project the session
-- is surfaced in, including the origin. memory_items stay single-project — only
-- the SESSION is shared, never the derived facts.

create table if not exists session_projects (
  session_id uuid not null references source_sessions(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, project_id)
);

-- Reverse lookup: "which sessions are linked to project P".
create index if not exists idx_session_projects_project
  on session_projects (project_id);

-- Backfill: every existing session is linked to its current origin project so
-- the union read path ("origin OR linked") returns today's sessions unchanged.
insert into session_projects (session_id, project_id)
select id, project_id from source_sessions
on conflict (session_id, project_id) do nothing;

-- RLS: authorize on membership of the linked project, matching the
-- "Members manage sessions" policy on source_sessions (0001). enable (not force)
-- mirrors every sibling table in this schema.
alter table session_projects enable row level security;

drop policy if exists "Members manage session_projects" on session_projects;
create policy "Members manage session_projects" on session_projects
  for all
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

-- DOWN
-- drop policy if exists "Members manage session_projects" on session_projects;
-- alter table session_projects disable row level security;
-- drop index if exists idx_session_projects_project;
-- drop table if exists session_projects;
