-- Convert search_vector from GENERATED ALWAYS column to a regular column.
-- This is required because encrypted content produces garbage search vectors.
-- The application now computes search_vector from plaintext before storing.

-- Drop the generated column
ALTER TABLE memory_items DROP COLUMN IF EXISTS search_vector;

-- Re-add as a regular (non-generated) column
ALTER TABLE memory_items ADD COLUMN search_vector tsvector;

-- Re-create the GIN index
CREATE INDEX IF NOT EXISTS idx_memory_items_search ON memory_items USING gin(search_vector);
