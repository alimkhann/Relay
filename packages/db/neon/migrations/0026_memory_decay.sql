-- Add last_reaffirmed_at column for decay clock reset
ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS last_reaffirmed_at TIMESTAMPTZ DEFAULT NULL;

-- Index for efficient decay-based queries
CREATE INDEX IF NOT EXISTS idx_memory_items_last_reaffirmed_at
  ON memory_items (last_reaffirmed_at) WHERE last_reaffirmed_at IS NOT NULL AND is_archived = false;
