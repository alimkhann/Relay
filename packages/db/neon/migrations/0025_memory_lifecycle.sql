-- Add forget_after column for time-based memory expiry
ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS forget_after TIMESTAMPTZ DEFAULT NULL;

-- Partial index for efficient expired-item queries
CREATE INDEX IF NOT EXISTS idx_memory_items_forget_after
  ON memory_items (forget_after) WHERE forget_after IS NOT NULL AND is_archived = false;
