create type user_onboarding_status as enum ('pending', 'completed');
create type onboarding_completion_surface as enum ('web', 'extension');

create table if not exists user_onboarding (
  user_id text primary key references profiles(id) on delete cascade,
  status user_onboarding_status not null default 'pending',
  completed_project_id uuid references projects(id) on delete set null,
  completed_via onboarding_completion_surface,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists browser_session_handoffs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references profiles(id) on delete cascade,
  handoff_hash text not null unique,
  handoff_prefix text not null,
  encrypted_google_access_token text not null,
  encrypted_google_id_token text not null,
  next_path text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_onboarding_status
  on user_onboarding(status, updated_at desc);

create index if not exists idx_browser_session_handoffs_user_created_at
  on browser_session_handoffs(user_id, created_at desc);

alter table user_onboarding enable row level security;
alter table browser_session_handoffs enable row level security;

create policy "Users manage own onboarding state"
on user_onboarding
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());

create policy "Users manage own browser handoffs"
on browser_session_handoffs
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());
