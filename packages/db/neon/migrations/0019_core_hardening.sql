-- Migration 0019: Core hardening for auth/session reliability

-- Clean break for in-flight MCP auth sessions and browser handoffs.
update mcp_auth_sessions
set status = 'expired'
where status in ('pending', 'approved', 'exchanging');

update browser_session_handoffs
set consumed_at = now()
where consumed_at is null;

-- Remove plaintext MCP auth token persistence.
alter table mcp_auth_sessions
  drop column if exists access_token,
  drop column if exists refresh_token,
  drop column if exists access_expires_at,
  drop column if exists refresh_expires_at;

create index if not exists idx_mcp_auth_sessions_status_expires
  on mcp_auth_sessions(status, expires_at desc);

create index if not exists idx_browser_session_handoffs_lookup
  on browser_session_handoffs(handoff_hash, consumed_at, expires_at desc);

create unique index if not exists idx_work_sessions_active_identity
  on work_sessions(
    project_id,
    surface,
    coalesce(workspace_id, ''),
    coalesce(thread_id, ''),
    coalesce(client_name, '')
  )
  where status = 'active';

create index if not exists idx_work_sessions_thread_lookup
  on work_sessions(project_id, surface, thread_id, client_name, updated_at desc)
  where thread_id is not null;
