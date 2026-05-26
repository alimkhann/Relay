/**
 * Memory pipeline worker — async enrichment + hygiene tick.
 *
 * Pickup query: memory_items + observations WHERE enrichment_status in
 * ('pending','failed') AND enrichment_version < CURRENT_VERSION.
 *
 * Steps per item:
 *   1. Embed (skip if embedding already present and embedding_model current).
 *   2. Extract entities (delegates to entity-extraction-service via callback).
 *   3. Extract observations (free-form + SVO when confident).
 *   4. Resolve conflicts:
 *        - memory_items: resolveMemoryConflict; on loss, set valid_until + cooling.
 *        - observations: resolveObservationConflict; on SVO match, close prior.
 *   5. Infer entity_relations from any SVO observations the worker created.
 *
 * After each successful pass, bump enrichment_version and write a
 * memory_events audit row.
 *
 * The worker is intentionally decoupled from the embedding/extraction
 * services — callers inject them. This keeps the package free of platform-
 * specific deps (Gemini, encryption, etc.) and lets the apps/web cron entry
 * wire concrete providers.
 */

import type {
  EntityRelationRepository,
  GraphRepository,
  MemoryRepository,
  ObservationRepository,
  SpaceRepository,
} from "@relay/db"
import type { EntityRepository } from "@relay/db"
import type { DatabaseProvider } from "@relay/db"

import { runHygieneTick, type HygieneOptions, type HygieneResult } from "./hygiene"

export interface EnrichmentContext {
  itemId: string
  spaceId: string
  type: string
  content: string
  metadata: Record<string, unknown>
}

export interface ExtractedObservation {
  content: string
  confidence?: number
  subjectName?: string | null
  predicate?: string | null
  objectName?: string | null
  objectLiteral?: string | null
}

export interface ExtractedEntity {
  name: string
  kind?: string
  mentionText: string
}

export interface PipelineProviders {
  /** Embed a single text fragment to a numeric vector. */
  embed: (text: string) => Promise<{ vector: number[]; model: string }>
  /** Extract canonical entities from the item content. */
  extractEntities?: (ctx: EnrichmentContext) => Promise<ExtractedEntity[]>
  /** Extract observations from the item content. */
  extractObservations?: (
    ctx: EnrichmentContext,
  ) => Promise<ExtractedObservation[]>
}

export interface MemoryPipelineRepos {
  provider: DatabaseProvider
  memory: MemoryRepository
  observation: ObservationRepository
  entityRelation: EntityRelationRepository
  entity: EntityRepository
  graph: GraphRepository
  space: SpaceRepository
}

export interface ProcessItemResult {
  itemId: string
  entitiesCreated: number
  observationsCreated: number
  relationsCreated: number
  conflictsResolved: number
  embeddingApplied: boolean
  status: "done" | "failed" | "skipped"
  error?: string
}

/**
 * Pipeline version. Bumped to 2 when Gemini entity + observation extractors
 * land. Bumping forces `tick()` to reclaim any row with
 * `enrichment_version < PIPELINE_VERSION` AND status in ('pending','failed').
 * Rows still in `done` are NOT auto-reclaimed — the backfill migration
 * (0049_backfill_v1_to_v2_extraction.sql) flips them to `pending` so the
 * worker reprocesses legacy items through the new extractor pipeline.
 */
export const PIPELINE_VERSION = 2

/**
 * Process a single memory_item. Idempotent — re-running with the same row
 * after a successful pass will skip via enrichment_version.
 */
export async function processItem(
  repos: MemoryPipelineRepos,
  providers: PipelineProviders,
  itemId: string,
): Promise<ProcessItemResult> {
  const item = await repos.memory.getById(itemId)
  if (!item) {
    return {
      itemId,
      entitiesCreated: 0,
      observationsCreated: 0,
      relationsCreated: 0,
      conflictsResolved: 0,
      embeddingApplied: false,
      status: "skipped",
      error: "memory item not found",
    }
  }

  const result: ProcessItemResult = {
    itemId,
    entitiesCreated: 0,
    observationsCreated: 0,
    relationsCreated: 0,
    conflictsResolved: 0,
    embeddingApplied: false,
    status: "done",
  }

  // Atomically claim the row. The WHERE guard means a concurrent worker
  // invocation can't claim the same item twice — if RETURNING is empty,
  // someone else already took it (or it's already done), so skip.
  const claimed = await repos.provider.query(
    `UPDATE memory_items SET enrichment_status = 'running'
     WHERE id = $1 AND enrichment_status IN ('pending','failed')
     RETURNING id`,
    [itemId],
  )
  if (claimed.length === 0) {
    result.status = "skipped"
    result.error = "already claimed or not pending"
    return result
  }

  try {
    const spaceId = (item as { spaceId?: string }).spaceId ?? null
    if (!spaceId) {
      throw new Error(`memory_item ${itemId} missing space_id; backfill drift`)
    }

    const ctx: EnrichmentContext = {
      itemId: item.id,
      spaceId,
      type: item.type,
      content: item.content,
      metadata: item.metadata ?? {},
    }

    // Step 1 — embed
    const needsEmbedding = !(item as { embeddingModel?: string }).embeddingModel
    if (needsEmbedding) {
      const { vector, model } = await providers.embed(item.content)
      await repos.provider.query(
        `UPDATE memory_items SET embedding = $2::vector, embedding_model = $3 WHERE id = $1`,
        [itemId, JSON.stringify(vector), model],
      )
      result.embeddingApplied = true
    }

    // Step 2 — entities
    const extractedEntities = providers.extractEntities
      ? await providers.extractEntities(ctx)
      : []
    const entityIdByName = new Map<string, string>()
    for (const extracted of extractedEntities) {
      // Space-scoped so personal-space items (project_id NULL) work too.
      const entity = await repos.entity.findOrCreateBySpace(
        spaceId,
        extracted.name,
        extracted.kind ?? "unknown",
      )
      entityIdByName.set(extracted.name.toLowerCase(), entity.id)
      await repos.entity.addMention(itemId, entity.id, extracted.mentionText, spaceId)
      result.entitiesCreated += 1
    }

    // Step 3 — observations
    const extracted = providers.extractObservations
      ? await providers.extractObservations(ctx)
      : []
    for (const obs of extracted) {
      const subjectId = obs.subjectName
        ? entityIdByName.get(obs.subjectName.toLowerCase()) ?? null
        : null
      const objectId = obs.objectName
        ? entityIdByName.get(obs.objectName.toLowerCase()) ?? null
        : null

      // Detect a conflicting prior SVO *before* inserting the new row — once
      // the new observation lands it becomes the current SVO and would match
      // itself. We invalidate + emit the audit event after the insert so the
      // `superseded_by` field carries the new observation's real id.
      let priorToSupersede: string | null = null
      if (subjectId && obs.predicate) {
        const prior = await repos.observation.findCurrentSvo(
          spaceId,
          subjectId,
          obs.predicate,
        )
        if (prior) {
          const priorObject = prior.objectEntityId ?? prior.objectLiteral?.toLowerCase()
          const newObject = objectId ?? obs.objectLiteral?.toLowerCase()
          if (priorObject && newObject && priorObject !== newObject) {
            priorToSupersede = prior.id
          }
        }
      }

      const created = await repos.observation.create({
        spaceId,
        content: obs.content,
        sourceMemoryItemId: itemId,
        subjectEntityId: subjectId,
        predicate: obs.predicate ?? null,
        objectEntityId: objectId,
        objectLiteral: obs.objectLiteral ?? null,
        confidence: obs.confidence,
      })
      result.observationsCreated += 1

      // Embed observation immediately so retrieval picks it up.
      try {
        const { vector, model } = await providers.embed(obs.content)
        await repos.observation.updateEmbedding(created.id, vector, model)
      } catch {
        // Non-fatal: observation row is still searchable via lexical channel.
      }

      if (priorToSupersede) {
        await repos.observation.invalidate(priorToSupersede, new Date(), "cooling")
        result.conflictsResolved += 1
        await repos.provider.query(
          `INSERT INTO memory_events
            (project_id, space_id, memory_item_id, event_type, source_surface, payload)
           VALUES ($1, $2, NULL, 'observation_expired', 'worker',
                   jsonb_build_object('observation_id', $3::text,
                                      'reason', 'svo_superseded',
                                      'superseded_by', $4::text))`,
          [item.projectId, spaceId, priorToSupersede, created.id],
        )
      }

      // Step 4 — entity_relations from SVO
      if (subjectId && objectId && obs.predicate) {
        // Object changed → close any prior current edge for this
        // (subject, predicate) that points at a different target, so the SVO
        // never has two "current" edges at once.
        await repos.entityRelation.invalidateCurrentForSubjectPredicate(
          spaceId,
          subjectId,
          obs.predicate,
          objectId,
        )
        await repos.entityRelation.upsertCurrent({
          spaceId,
          sourceEntityId: subjectId,
          targetEntityId: objectId,
          relationType: obs.predicate,
          confidence: obs.confidence ?? 0.8,
          sourceObservationId: created.id,
          sourceMemoryItemId: itemId,
        })
        result.relationsCreated += 1
      }

      await repos.provider.query(
        `INSERT INTO memory_events
          (project_id, space_id, memory_item_id, event_type, source_surface, payload)
         VALUES ($1, $2, $3, 'observation_created', 'worker',
                 jsonb_build_object('observation_id', $4::text,
                                    'confidence', $5,
                                    'is_svo', $6))`,
        [
          item.projectId,
          spaceId,
          itemId,
          created.id,
          obs.confidence ?? 1.0,
          Boolean(subjectId && obs.predicate),
        ],
      )
    }

    await repos.provider.query(
      `UPDATE memory_items
       SET enrichment_status = 'done',
           enrichment_version = $2,
           enriched_at = now(),
           enrichment_error = NULL
       WHERE id = $1`,
      [itemId, PIPELINE_VERSION],
    )
  } catch (err) {
    result.status = "failed"
    result.error = err instanceof Error ? err.message : String(err)
    await repos.provider.query(
      `UPDATE memory_items
       SET enrichment_status = 'failed',
           enrichment_error = $2
       WHERE id = $1`,
      [itemId, result.error],
    )
  }

  return result
}

/**
 * Pick up at most `batchSize` pending items across all spaces and process
 * them sequentially. Caller invokes this on a Vercel cron tick (or queue
 * consumer).
 */
export async function tick(
  repos: MemoryPipelineRepos,
  providers: PipelineProviders,
  options: { batchSize?: number } = {},
): Promise<ProcessItemResult[]> {
  const batchSize = Math.min(Math.max(options.batchSize ?? 25, 1), 200)
  const rows = await repos.provider.query(
    `SELECT id
     FROM memory_items
     WHERE enrichment_status IN ('pending','failed')
       AND enrichment_version < $2
     ORDER BY created_at ASC
     LIMIT $1`,
    [batchSize, PIPELINE_VERSION],
  )
  const results: ProcessItemResult[] = []
  for (const row of rows) {
    const itemId = String((row as Record<string, unknown>).id)
    results.push(await processItem(repos, providers, itemId))
  }
  return results
}

export { runHygieneTick }
export type { HygieneOptions, HygieneResult }
