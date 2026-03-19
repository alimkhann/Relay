create table if not exists surface_sync_marks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  surface text not null,
  last_sync_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, user_id, surface)
);

create index if not exists idx_surface_sync_marks_project_user_surface
  on surface_sync_marks(project_id, user_id, surface);

alter table surface_sync_marks enable row level security;

create policy "Users manage own surface sync marks"
on surface_sync_marks
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());
