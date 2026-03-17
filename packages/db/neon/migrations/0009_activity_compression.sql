-- Migration 0009: Activity Compression
-- Adds source_conversation_id to source_sessions for grouping captures from the same conversation

-- Add source_conversation_id column (nullable, derived from URL or explicit conversation ID)
alter table source_sessions
  add column if not exists source_conversation_id text;

-- Add is_archived column if missing (may already exist from prior migrations)
alter table source_sessions
  add column if not exists is_archived boolean not null default false;

alter table source_sessions
  add column if not exists archived_at timestamptz;

alter table source_sessions
  add column if not exists archived_by text references profiles(id) on delete set null;

-- Backfill source_conversation_id from URL for existing rows
-- Supports all 7 AI platforms + MCP coding agents:
-- ChatGPT: https://chatgpt.com/c/{conversation_id} or https://chat.openai.com/c/{conversation_id}
-- Claude: https://claude.ai/chat/{conversation_id}
-- Perplexity: https://perplexity.ai/search/{thread_id}
-- Codex: https://chatgpt.com/codex/* (use full URL as ID)
-- Gemini: https://gemini.google.com/app/{conversation_id}
-- Grok: https://x.com/i/grok?conversation={conversation_id} or grok.x.ai paths
-- DeepSeek: https://chat.deepseek.com/a/chat/s/{conversation_id}
-- Note: Platform enum may need extension for gemini, grok, deepseek — backfill handles them when added

update source_sessions
set source_conversation_id = case
  -- ChatGPT: extract /c/{id} or /g/{id}
  when platform = 'chatgpt' and url ~ '/[cg]/[a-zA-Z0-9-]+' then
    regexp_replace(url, '^.*/([cg]/[a-zA-Z0-9-]+).*$', '\1')
  -- Claude: extract /chat/{id}
  when platform = 'claude' and url ~ '/chat/[a-zA-Z0-9-]+' then
    regexp_replace(url, '^.*/chat/([a-zA-Z0-9-]+).*$', '\1')
  -- Perplexity: extract /search/{id}
  when platform = 'perplexity' and url ~ '/search/[a-zA-Z0-9-]+' then
    regexp_replace(url, '^.*/search/([a-zA-Z0-9-]+).*$', '\1')
  -- Codex: use URL path after /codex
  when platform = 'codex' and url ~ '/codex' then
    regexp_replace(url, '^.*/codex(.*)$', 'codex\1')
  -- Gemini: extract /app/{id} (when platform enum extended)
  when platform::text = 'gemini' and url ~ '/app/[a-zA-Z0-9-]+' then
    regexp_replace(url, '^.*/app/([a-zA-Z0-9-]+).*$', '\1')
  -- Grok: extract conversation param or path (when platform enum extended)
  when platform::text = 'grok' and url ~ 'conversation=' then
    regexp_replace(url, '^.*conversation=([a-zA-Z0-9-]+).*$', '\1')
  when platform::text = 'grok' and url ~ '/grok/[a-zA-Z0-9-]+' then
    regexp_replace(url, '^.*/grok/([a-zA-Z0-9-]+).*$', '\1')
  -- DeepSeek: extract /s/{id} (when platform enum extended)
  when platform::text = 'deepseek' and url ~ '/s/[a-zA-Z0-9-]+' then
    regexp_replace(url, '^.*/s/([a-zA-Z0-9-]+).*$', '\1')
  -- Fallback: use URL as conversation ID
  else url
end
where source_conversation_id is null;

-- Index for grouping queries
create index if not exists idx_source_sessions_conversation_group
  on source_sessions(project_id, source_conversation_id, captured_at desc);

-- Index for platform + conversation grouping
create index if not exists idx_source_sessions_platform_conversation
  on source_sessions(project_id, platform, source_conversation_id, captured_at desc);
