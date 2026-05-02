-- Migration: 0010_source_provenance
-- Phase 3: Source Provenance - Track where memory items originated from
-- Adds columns to track capture source (browser chat, MCP, etc.), conversation URL,
-- capture timestamp, and derivation lineage for conflict resolution.

-- source_surface: The surface/client that created this memory item
-- Values: 'chatgpt', 'claude', 'gemini', 'grok', 'perplexity', 'deepseek', 'codex', 'mcp', 'web', 'api'
ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS source_surface text;

-- source_conversation_id: Normalized conversation ID for linking back to source
-- e.g., "c/abc123" for ChatGPT, "chat/xyz" for Claude
ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS source_conversation_id text;

-- source_url: Full URL to the source conversation (clickable link)
-- e.g., "https://chatgpt.com/c/abc123", "https://claude.ai/chat/xyz"
ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS source_url text;

-- captured_at: Timestamp when this memory was actually captured/created
-- Used for conflict resolution (recency-based: newest captured_at wins)
-- Separate from created_at which tracks DB insertion time
ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS captured_at timestamptz;

-- derived_from: Array of memory item IDs this item was derived/merged from
-- Used for lineage tracking when items are merged or deduplicated
ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS derived_from text[];

-- Backfill captured_at with created_at for existing rows
UPDATE memory_items SET captured_at = created_at WHERE captured_at IS NULL;

-- Create index for querying by source surface (useful for filtering by origin)
CREATE INDEX IF NOT EXISTS idx_memory_items_source_surface ON memory_items(source_surface) WHERE source_surface IS NOT NULL;

-- Create index for querying by source conversation (useful for grouping)
CREATE INDEX IF NOT EXISTS idx_memory_items_source_conversation_id ON memory_items(source_conversation_id) WHERE source_conversation_id IS NOT NULL;

-- Create index for conflict resolution queries (ordering by captured_at)
CREATE INDEX IF NOT EXISTS idx_memory_items_captured_at ON memory_items(captured_at DESC) WHERE captured_at IS NOT NULL;

-- Comment on columns for documentation
COMMENT ON COLUMN memory_items.source_surface IS 'Origin surface: chatgpt, claude, gemini, grok, perplexity, deepseek, codex, mcp, web, api';
COMMENT ON COLUMN memory_items.source_conversation_id IS 'Normalized conversation ID for linking (e.g., c/abc123 for ChatGPT)';
COMMENT ON COLUMN memory_items.source_url IS 'Full URL to source conversation for clickable provenance links';
COMMENT ON COLUMN memory_items.captured_at IS 'Actual capture timestamp for recency-based conflict resolution';
COMMENT ON COLUMN memory_items.derived_from IS 'Array of memory item IDs this item was derived/merged from';
