create table if not exists cli_auth_sessions (
  id uuid primary key default gen_random_uuid(),
  session_code text not null,
  session_hash text not null unique,
  session_prefix text not null,
  user_id text references profiles(id) on delete cascade,
  device_name text not null default 'CLI',
  status text not null default 'pending',
  api_token text,
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_cli_auth_sessions_hash on cli_auth_sessions(session_hash);
create index idx_cli_auth_sessions_code on cli_auth_sessions(session_code) where status = 'pending';

alter table cli_auth_sessions enable row level security;

create policy "Service access when no user context"
on cli_auth_sessions
for all
using (current_setting('relay.current_user_id', true) is null or current_setting('relay.current_user_id', true) = '')
with check (current_setting('relay.current_user_id', true) is null or current_setting('relay.current_user_id', true) = '');

create policy "Users manage own CLI auth sessions"
on cli_auth_sessions
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());
