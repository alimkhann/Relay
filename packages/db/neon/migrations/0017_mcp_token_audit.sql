alter table mcp_tokens
  add column if not exists last_used_at timestamptz,
  add column if not exists rotation_count integer not null default 0;

create index if not exists idx_mcp_tokens_last_used_at
  on mcp_tokens(last_used_at desc nulls last);
