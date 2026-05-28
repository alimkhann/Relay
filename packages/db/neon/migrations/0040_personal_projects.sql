-- Memory Architecture v2 — personal projects.
-- Replaces the dropped `spaces` layer. Personal memory is just a `projects`
-- row with kind='personal' (one per profile), so the entire existing project
-- pipeline (brief / state / digest / canon / sources / graph) serves personal
-- for free. project_id stays NOT NULL everywhere; personal items carry the
-- personal project's id. No separate scope, no space_members.

alter table projects
  add column if not exists kind text not null default 'project';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'projects'::regclass
      and conname  = 'projects_kind_check'
  ) then
    alter table projects
      add constraint projects_kind_check check (kind in ('project','personal'));
  end if;
end$$;

-- One personal project per owner.
create unique index if not exists idx_projects_personal_unique
  on projects (owner_id) where kind = 'personal';

create index if not exists idx_projects_owner_kind
  on projects (owner_id, kind);

-- Backfill: one personal project per existing profile. Slug is owner-scoped
-- unique (owner_id, slug); suffixing the profile id guarantees no collision
-- with a user-created project that happens to be slugged 'personal'.
insert into projects (id, owner_id, name, slug, description, kind, created_at, updated_at)
select gen_random_uuid(), pr.id, 'Personal', 'personal-' || pr.id,
       'Personal memory that lives outside any project.', 'personal',
       pr.created_at, pr.updated_at
from profiles pr
where not exists (
  select 1 from projects p where p.owner_id = pr.id and p.kind = 'personal'
);

-- NON-NEGOTIABLE: owner project_members row for each personal project, else
-- is_project_member() is false and the owner is locked out of their own items.
insert into project_members (project_id, user_id, role, created_at)
select p.id, p.owner_id, 'owner', p.created_at
from projects p
where p.kind = 'personal'
on conflict (project_id, user_id) do nothing;

-- DOWN
-- delete from project_members pm using projects p
--   where pm.project_id = p.id and p.kind = 'personal';
-- delete from projects where kind = 'personal';
-- drop index if exists idx_projects_owner_kind;
-- drop index if exists idx_projects_personal_unique;
-- alter table projects drop constraint if exists projects_kind_check;
-- alter table projects drop column if exists kind;
