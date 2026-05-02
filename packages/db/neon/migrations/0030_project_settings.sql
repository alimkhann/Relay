create table if not exists project_settings (
  project_id uuid primary key references projects(id) on delete cascade,
  settings jsonb not null default '{"autonomyMode":"standard","showTentativeUpdates":true,"includeTentativeUpdatesInPackets":true,"compactionMode":"standard"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table project_settings enable row level security;

create policy "Members manage project settings"
on project_settings
for all
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));
