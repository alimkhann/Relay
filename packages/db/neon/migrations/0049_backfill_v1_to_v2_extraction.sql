-- Re-enqueue all legacy memory_items so the v2 Gemini extractors populate
-- observations + entity_relations against existing user data.
--
-- Background: migration 0046 marked the 604+ rows that pre-dated the worker
-- as `enrichment_status='done', enrichment_version=1` so the first embed-only
-- tick wouldn't re-extract them. With PIPELINE_VERSION bumped to 2 (Gemini
-- extractors landed), the worker's tick condition
--   WHERE enrichment_status IN ('pending','failed')
--     AND enrichment_version < 2
-- only matches rows whose status is already pending. Without this re-enqueue,
-- existing users' graph/observations stay empty forever after the v2 cutover.
--
-- Safety:
--   - Only flips done rows whose version < 2 (no-op once worker catches up).
--   - Does NOT clear enrichment_error so we don't re-claim known-bad rows;
--     status='failed' rows are already in the pickup query if they had any.
--   - Status flip is atomic per-row; concurrent workers can't double-claim
--     because processItem WHERE-guards on the status transition.
--   - Worker is paced by RELAY_PIPELINE_DAILY_USD_CAP. Apply only after
--     RELAY_MEMORY_PIPELINE_FULL=true has been flipped + soaked on new
--     writes for 24-48h to catch prompt-quality regressions before they
--     fan out across the entire backlog.
--   - RLS ORDERING GATE: if the app has been swapped to the non-owner
--     relay_app role (F3 cutover), the pipeline worker must already have
--     `bypassrls` (relay_worker, granted via the Neon console — see
--     docs/memory-v2/roles.sql). Otherwise every observation/entity_relation
--     INSERT the extractor makes is silently RLS-denied (0 rows, no error):
--     this re-enqueue would flip 604+ rows to pending and burn Gemini spend
--     while the graph stays empty. Sequence: relay_worker bypassrls -> soak
--     -> THEN this backfill.

update memory_items
set enrichment_status = 'pending'
where enrichment_status = 'done'
  and enrichment_version = 1;

-- DOWN
-- No automatic rollback. To "unbackfill" partially-extracted rows you must
-- manually delete the extracted observations + entity_relations attributed
-- to the worker run and reset enrichment_version back to 1.
