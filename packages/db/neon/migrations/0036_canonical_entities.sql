CREATE TABLE canonical_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'unknown',
  aliases TEXT[] DEFAULT '{}',
  embedding vector(768),
  merged_into_id UUID REFERENCES canonical_entities(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE entity_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_item_id UUID NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES canonical_entities(id) ON DELETE CASCADE,
  mention_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_canonical_entities_project ON canonical_entities(project_id);
CREATE UNIQUE INDEX idx_canonical_entities_project_name ON canonical_entities(project_id, lower(name)) WHERE merged_into_id IS NULL;
CREATE INDEX idx_entity_mentions_entity ON entity_mentions(entity_id);
CREATE INDEX idx_entity_mentions_memory ON entity_mentions(memory_item_id);
CREATE UNIQUE INDEX idx_entity_mentions_unique ON entity_mentions(memory_item_id, entity_id);
