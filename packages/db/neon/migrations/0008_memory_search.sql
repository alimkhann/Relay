-- Add full-text search vector to memory_items
ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || content)
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_memory_items_search ON memory_items USING gin(search_vector);

-- Add tags to memory_items
ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_memory_items_tags ON memory_items USING gin(tags);
