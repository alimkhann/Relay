create table if not exists mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references profiles(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  token_hash text not null unique,
  token_prefix text not null,
  scopes text[] not null,
  expires_at timestamptz not null,
  refresh_token_hash text,
  refresh_token_prefix text,
  refresh_expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mcp_tokens_user_project_created_at
  on mcp_tokens(user_id, project_id, created_at desc);

alter table mcp_tokens enable row level security;

create policy "Users manage own MCP tokens"
on mcp_tokens
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());
