-- Memory v2 — hand-check SQL.
-- Run against the dev branch. Each block is idempotent / safe to re-run.

-- 1. Migration tracking — confirm all v2 migrations recorded.
SELECT file_name, applied_at
FROM relay_schema_migrations
WHERE file_name >= '0040'
ORDER BY file_name;

-- 2. Spaces taxonomy — 1 personal per profile, 1 project per project.
SELECT
  (SELECT count(*) FROM spaces WHERE kind='personal') AS personal_spaces,
  (SELECT count(*) FROM profiles) AS profiles,
  (SELECT count(*) FROM spaces WHERE kind='project') AS project_spaces,
  (SELECT count(*) FROM projects) AS projects;

-- 3. space_members backfill — ≥ project_members + 1-per-personal-space.
SELECT
  (SELECT count(*) FROM space_members) AS space_members,
  (SELECT count(*) FROM project_members) AS project_members,
  (SELECT count(*) FROM spaces WHERE kind='personal') AS personal_spaces;

-- 4. memory_items v2 columns — all rows have lifecycle_state + space_id + valid_from.
SELECT
  count(*)                                                 AS total,
  count(*) FILTER (WHERE space_id IS NULL)                 AS null_space,
  count(*) FILTER (WHERE lifecycle_state IS NULL)          AS null_lifecycle,
  count(*) FILTER (WHERE valid_from IS NULL)               AS null_valid_from,
  count(*) FILTER (WHERE lifecycle_state = 'active')       AS active,
  count(*) FILTER (WHERE lifecycle_state = 'cooling')      AS cooling,
  count(*) FILTER (WHERE lifecycle_state = 'archived')     AS archived,
  count(*) FILTER (WHERE lifecycle_state = 'forgotten')    AS forgotten
FROM memory_items;

-- 5. RLS enabled where expected.
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname='public'
  AND tablename IN ('spaces','space_members','observations','entity_relations',
                    'canonical_entities','entity_mentions','memory_items',
                    'memory_relations','memory_events','source_sessions',
                    'bootstrap_packets','project_sources')
ORDER BY tablename;

-- 6. platform_type enum extended.
SELECT enumlabel
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname='platform_type'
ORDER BY e.enumsortorder;

-- 7. memory_events.event_type CHECK includes v2 values.
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname='memory_events_event_type_check';

-- 8. memory_half_lives seeded.
SELECT * FROM memory_half_lives ORDER BY item_type;

-- 9. Trigger sanity round-trip — insert a personal-space test item.
--    Cleanup: delete returned id after inspecting.
WITH owner AS (
  SELECT id FROM profiles ORDER BY created_at LIMIT 1
), space AS (
  SELECT s.id FROM spaces s JOIN owner o ON s.owner_id = o.id WHERE s.kind = 'personal' LIMIT 1
)
INSERT INTO memory_items (space_id, project_id, type, content, created_by, source_surface, captured_at, valid_from)
SELECT space.id, NULL, 'note', '[VERIFY] trigger sanity', owner.id, 'mcp', now(), now()
FROM space, owner
RETURNING id, lifecycle_state, is_archived;

-- Flip via lifecycle_state — is_archived should follow.
UPDATE memory_items
SET lifecycle_state = 'archived'
WHERE content = '[VERIFY] trigger sanity'
RETURNING lifecycle_state, is_archived;

-- Flip via legacy is_archived — lifecycle_state should follow.
UPDATE memory_items
SET is_archived = false
WHERE content = '[VERIFY] trigger sanity'
RETURNING lifecycle_state, is_archived;

-- Cleanup verification rows.
DELETE FROM memory_items WHERE content = '[VERIFY] trigger sanity';

-- 10. Project-space graph snapshot — entities present, edges empty until worker runs.
SELECT
  s.name,
  (SELECT count(*) FROM canonical_entities WHERE space_id = s.id) AS entities,
  (SELECT count(*) FROM entity_relations WHERE space_id = s.id)   AS entity_relations,
  (SELECT count(*) FROM observations    WHERE space_id = s.id)    AS observations,
  (SELECT count(*) FROM memory_items    WHERE space_id = s.id AND lifecycle_state = 'active') AS active_items
FROM spaces s
WHERE s.kind = 'project'
ORDER BY active_items DESC
LIMIT 5;
