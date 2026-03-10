create extension if not exists pgcrypto;

create type platform_type as enum ('chatgpt', 'perplexity', 'claude', 'claude_code', 'codex');
create type source_turn_role as enum ('user', 'assistant', 'system', 'unknown');
create type memory_item_type as enum ('note', 'decision', 'constraint', 'requirement', 'task', 'artifact');
create type member_role as enum ('owner', 'editor', 'viewer');
create type binding_type as enum ('tab', 'domain', 'manual');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role member_role not null,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create table public.source_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
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

create table public.source_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.source_sessions(id) on delete cascade,
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

create table public.memory_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_turn_id uuid references public.source_turns(id) on delete set null,
  type memory_item_type not null,
  title text,
  content text not null,
  pinned boolean not null default false,
  is_archived boolean not null default false,
  sort_order integer,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.target_profiles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  platform platform_type not null,
  description text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.context_packets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  target_profile_id uuid not null references public.target_profiles(id) on delete restrict,
  content text not null,
  source_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.project_bindings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  binding_kind binding_type not null,
  domain text,
  tab_id text,
  platform platform_type,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.capture_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  session_id uuid references public.source_sessions(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_projects_owner_updated_at on public.projects(owner_id, updated_at desc);
create index idx_source_sessions_project_captured_at on public.source_sessions(project_id, captured_at desc);
create index idx_memory_items_project_type_pinned_active on public.memory_items(project_id, type, pinned, is_archived);
create index idx_context_packets_project_created_at on public.context_packets(project_id, created_at desc);
create index idx_project_bindings_user_tab_id on public.project_bindings(user_id, tab_id);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.source_sessions enable row level security;
alter table public.source_turns enable row level security;
alter table public.memory_items enable row level security;
alter table public.target_profiles enable row level security;
alter table public.context_packets enable row level security;
alter table public.project_bindings enable row level security;
alter table public.capture_events enable row level security;
alter table public.user_settings enable row level security;

create or replace function public.is_project_member(project_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = project_uuid
      and pm.user_id = auth.uid()
  );
$$;

create policy "Users can view own profile"
on public.profiles for select
using (id = auth.uid());

create policy "Members can read projects"
on public.projects for select
using (public.is_project_member(id));

create policy "Owners can write projects"
on public.projects for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());
