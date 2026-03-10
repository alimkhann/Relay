create extension if not exists pgcrypto;

create type platform_type as enum ('chatgpt', 'perplexity', 'claude', 'claude_code', 'codex');
create type source_turn_role as enum ('user', 'assistant', 'system', 'unknown');
create type memory_item_type as enum ('note', 'decision', 'constraint', 'requirement', 'task', 'artifact');
create type member_role as enum ('owner', 'editor', 'viewer');
create type binding_type as enum ('tab', 'domain', 'manual');

create table profiles (
  id text primary key,
  email text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references profiles(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create table project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  role member_role not null,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create table source_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  platform platform_type not null,
  url text not null,
  title text,
  tab_id text,
  window_id text,
  page_fingerprint text,
  metadata jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table source_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references source_sessions(id) on delete cascade,
  role source_turn_role not null default 'unknown',
  turn_index integer not null,
  content text not null,
  content_hash text not null,
  raw_html text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, turn_index),
  unique (session_id, content_hash)
);

create table memory_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  source_turn_id uuid references source_turns(id) on delete set null,
  type memory_item_type not null,
  title text,
  content text not null,
  pinned boolean not null default false,
  is_archived boolean not null default false,
  sort_order integer,
  metadata jsonb not null default '{}'::jsonb,
  created_by text not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table target_profiles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  platform platform_type not null,
  description text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table context_packets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  target_profile_id uuid not null references target_profiles(id) on delete restrict,
  content text not null,
  source_snapshot jsonb not null default '{}'::jsonb,
  created_by text not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table project_bindings (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references profiles(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  binding_kind binding_type not null,
  domain text,
  tab_id text,
  platform platform_type,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table capture_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references profiles(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  session_id uuid references source_sessions(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table user_settings (
  user_id text primary key references profiles(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table extension_api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references profiles(id) on delete cascade,
  device_name text not null,
  token_hash text not null unique,
  token_prefix text not null,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index idx_projects_owner_updated_at on projects(owner_id, updated_at desc);
create index idx_source_sessions_project_captured_at on source_sessions(project_id, captured_at desc);
create index idx_memory_items_project_type_pinned_active on memory_items(project_id, type, pinned, is_archived);
create index idx_context_packets_project_created_at on context_packets(project_id, created_at desc);
create index idx_project_bindings_user_tab_id on project_bindings(user_id, tab_id);
create index idx_extension_api_tokens_user_created_at on extension_api_tokens(user_id, created_at desc);

create unique index idx_project_bindings_scope
  on project_bindings (user_id, binding_kind, coalesce(domain, ''), coalesce(tab_id, ''));

create or replace function public.current_relay_user_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('relay.current_user_id', true), '');
$$;

create or replace function public.is_project_member(project_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from project_members pm
    where pm.project_id = project_uuid
      and pm.user_id = public.current_relay_user_id()
  );
$$;

create or replace function public.session_project_id(session_uuid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select source_sessions.project_id
  from source_sessions
  where source_sessions.id = session_uuid;
$$;

alter table profiles enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table source_sessions enable row level security;
alter table source_turns enable row level security;
alter table memory_items enable row level security;
alter table target_profiles enable row level security;
alter table context_packets enable row level security;
alter table project_bindings enable row level security;
alter table capture_events enable row level security;
alter table user_settings enable row level security;
alter table extension_api_tokens enable row level security;

create policy "Users manage own profile"
on profiles
for all
using (id = public.current_relay_user_id())
with check (id = public.current_relay_user_id());

create policy "Members read projects"
on projects
for select
using (public.is_project_member(id));

create policy "Owners write projects"
on projects
for all
using (owner_id = public.current_relay_user_id())
with check (owner_id = public.current_relay_user_id());

create policy "Members read membership"
on project_members
for select
using (public.is_project_member(project_id));

create policy "Owners manage membership"
on project_members
for all
using (
  exists (
    select 1
    from projects
    where projects.id = project_members.project_id
      and projects.owner_id = public.current_relay_user_id()
  )
)
with check (
  exists (
    select 1
    from projects
    where projects.id = project_members.project_id
      and projects.owner_id = public.current_relay_user_id()
  )
);

create policy "Members manage sessions"
on source_sessions
for all
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

create policy "Members manage turns"
on source_turns
for all
using (public.is_project_member(public.session_project_id(session_id)))
with check (public.is_project_member(public.session_project_id(session_id)));

create policy "Members manage memory"
on memory_items
for all
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

create policy "Authenticated users read target profiles"
on target_profiles
for select
using (public.current_relay_user_id() is not null);

create policy "Members manage context packets"
on context_packets
for all
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

create policy "Users manage own bindings"
on project_bindings
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());

create policy "Users manage own capture events"
on capture_events
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());

create policy "Users manage own settings"
on user_settings
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());

create policy "Users manage own extension tokens"
on extension_api_tokens
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());

insert into target_profiles (key, name, platform, description, config)
values
  ('chatgpt_planning', 'ChatGPT Planning', 'chatgpt', 'Structured planning handoff for ChatGPT.', '{}'::jsonb),
  ('perplexity_research', 'Perplexity Research', 'perplexity', 'Research handoff for Perplexity.', '{}'::jsonb),
  ('claude_code_build', 'Claude Code Build', 'claude_code', 'Implementation handoff for Claude Code.', '{}'::jsonb),
  ('codex_implementation', 'Codex Implementation', 'codex', 'Implementation handoff for Codex.', '{}'::jsonb)
on conflict (key) do nothing;
