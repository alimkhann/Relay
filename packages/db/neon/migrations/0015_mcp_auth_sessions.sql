create table if not exists mcp_auth_sessions (
  id uuid primary key default gen_random_uuid(),
  session_code text not null,
  session_hash text not null unique,
  session_prefix text not null,
  code_challenge text not null,
  project_id uuid not null references projects(id) on delete cascade,
  scopes text[] not null,
  user_id text references profiles(id) on delete cascade,
  status text not null default 'pending',
  access_token text,
  refresh_token text,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  expires_at timestamptz not null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_mcp_auth_sessions_hash on mcp_auth_sessions(session_hash);
create index if not exists idx_mcp_auth_sessions_code on mcp_auth_sessions(session_code) where status = 'pending';

alter table mcp_auth_sessions enable row level security;

create policy "Service access when no user context for MCP auth sessions"
on mcp_auth_sessions
for all
using (current_setting('relay.current_user_id', true) is null or current_setting('relay.current_user_id', true) = '')
with check (current_setting('relay.current_user_id', true) is null or current_setting('relay.current_user_id', true) = '');

create policy "Users manage own MCP auth sessions"
on mcp_auth_sessions
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());
