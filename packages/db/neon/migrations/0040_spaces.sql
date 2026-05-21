-- Memory Architecture v2 — spaces + space_members.
-- Introduces the `spaces` scope: one personal space per profile, and one
-- project space per existing project (1:1 backfill). Every memory-bearing
-- table will gain `space_id` in later migrations (0041, 0044). This file
-- only creates the new tables, the helper function, RLS, and backfills.

create table if not exists spaces (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('personal', 'project')),
  owner_id text not null references profiles(id) on delete cascade,
  name text not null,
  -- For project spaces: link back to the project so resolution is direct.
  -- For personal spaces: NULL.
  project_id uuid references projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One personal space per profile.
  constraint spaces_personal_unique_per_owner
    unique (owner_id, kind) deferrable initially deferred
);

-- Note: the unique constraint above is too strict (a user can own multiple
-- project spaces). Drop it and replace with a partial unique index.
alter table spaces drop constraint if exists spaces_personal_unique_per_owner;
create unique index if not exists idx_spaces_personal_unique
  on spaces (owner_id) where kind = 'personal';
create unique index if not exists idx_spaces_project_unique
  on spaces (project_id) where kind = 'project' and project_id is not null;
create index if not exists idx_spaces_owner on spaces (owner_id);

create table if not exists space_members (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','editor','member','viewer')),
  created_at timestamptz not null default now(),
  unique (space_id, user_id)
);

create index if not exists idx_space_members_user on space_members (user_id);
create index if not exists idx_space_members_space on space_members (space_id);

-- Helper: is_space_member mirrors is_project_member from 0001.
create or replace function public.is_space_member(space_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from space_members sm
    where sm.space_id = space_uuid
      and sm.user_id = current_setting('relay.current_user_id', true)
  );
$$;

-- RLS on the new tables.
alter table spaces enable row level security;
alter table space_members enable row level security;

drop policy if exists "Members read spaces" on spaces;
create policy "Members read spaces" on spaces
  for select
  using (public.is_space_member(id));

drop policy if exists "Owners write spaces" on spaces;
create policy "Owners write spaces" on spaces
  for all
  using (owner_id = current_setting('relay.current_user_id', true))
  with check (owner_id = current_setting('relay.current_user_id', true));

drop policy if exists "Members read own space_members" on space_members;
create policy "Members read own space_members" on space_members
  for select
  using (public.is_space_member(space_id));

drop policy if exists "Owners write space_members" on space_members;
create policy "Owners write space_members" on space_members
  for all
  using (
    exists (
      select 1 from spaces s
      where s.id = space_members.space_id
        and s.owner_id = current_setting('relay.current_user_id', true)
    )
  )
  with check (
    exists (
      select 1 from spaces s
      where s.id = space_members.space_id
        and s.owner_id = current_setting('relay.current_user_id', true)
    )
  );

-- Backfill: one project space per existing project.
insert into spaces (id, kind, owner_id, name, project_id, created_at, updated_at)
select gen_random_uuid(), 'project', p.owner_id, p.name, p.id, p.created_at, p.updated_at
from projects p
where not exists (
  select 1 from spaces s where s.project_id = p.id and s.kind = 'project'
);

-- Backfill: one personal space per existing profile.
insert into spaces (id, kind, owner_id, name, project_id, created_at, updated_at)
select gen_random_uuid(), 'personal', pr.id, coalesce(pr.display_name, 'Personal'), null, pr.created_at, pr.updated_at
from profiles pr
where not exists (
  select 1 from spaces s where s.owner_id = pr.id and s.kind = 'personal'
);

-- Backfill space_members: copy from project_members for project spaces.
insert into space_members (space_id, user_id, role, created_at)
select s.id, pm.user_id,
  case
    when s.owner_id = pm.user_id then 'owner'
    else coalesce(pm.role::text, 'member')
  end,
  pm.created_at
from project_members pm
join spaces s on s.project_id = pm.project_id and s.kind = 'project'
on conflict (space_id, user_id) do nothing;

-- Backfill space_members: owner row for each personal space.
insert into space_members (space_id, user_id, role, created_at)
select s.id, s.owner_id, 'owner', s.created_at
from spaces s
where s.kind = 'personal'
on conflict (space_id, user_id) do nothing;

-- DOWN
-- drop function if exists public.is_space_member(uuid);
-- drop table if exists space_members;
-- drop table if exists spaces;
