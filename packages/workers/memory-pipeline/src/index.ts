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
} from "@relay/db"
import type { EntityRepository } from "@relay/db"
import type { DatabaseProvider } from "@relay/db"

import { runHygieneTick, type HygieneOptions, type HygieneResult } from "./hygiene"

export interface EnrichmentContext {
  itemId: string
  projectId: string
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

  // When extractors are wired we mark the row done at the current pipeline
  // version. In embed-only mode we revert status back to 'pending' (no
  // version bump) so a future tick with FULL=true reclaims the row for
  // entity + observation extraction — otherwise the worker would silently
  // lock the legacy backfill (0049) out of v2 extraction.
  const ranFullExtraction = Boolean(
    providers.extractObservations || providers.extractEntities,
  )

  try {
    const projectId = item.projectId
    if (!projectId) {
      throw new Error(`memory_item ${itemId} missing project_id; backfill drift`)
    }

    const ctx: EnrichmentContext = {
      itemId: item.id,
      projectId,
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
      const entity = await repos.entity.findOrCreateByName(
        projectId,
        extracted.name,
        extracted.kind ?? "unknown",
      )
      entityIdByName.set(extracted.name.toLowerCase(), entity.id)
      await repos.entity.addMention(itemId, entity.id, extracted.mentionText)
      // F4 — embed-on-insert. If the entity row landed without an embedding
      // (freshly created), give it one now using `name (kind)` as the embed
      // text. Non-fatal — the backfill route still catches misses.
      if (!entity.hasEmbedding) {
        try {
          const text = entity.kind && entity.kind !== "unknown"
            ? `${entity.name} (${entity.kind})`
            : entity.name
          const { vector } = await providers.embed(text)
          await repos.entity.updateEmbedding(entity.id, vector)
        } catch (err) {
          // Recovery path: the entity row is already inserted, the backfill
          // cron will pick up the missing embedding later. Surface the error
          // so silent regressions (e.g. the next embedding-model deprecation)
          // are visible in logs instead of disappearing.
          console.warn(
            "[memory-pipeline] entity embed-on-insert failed",
            { entityId: entity.id, error: err instanceof Error ? err.message : String(err) },
          )
        }
      }
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
          projectId,
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
        projectId,
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
            (project_id, memory_item_id, event_type, source_surface, payload)
           VALUES ($1, NULL, 'observation_expired', 'worker',
                   jsonb_build_object('observation_id', $2::text,
                                      'reason', 'svo_superseded',
                                      'superseded_by', $3::text))`,
          [projectId, priorToSupersede, created.id],
        )
      }

      // Step 4 — entity_relations from SVO
      if (subjectId && objectId && obs.predicate) {
        // Object changed → close any prior current edge for this
        // (subject, predicate) that points at a different target, so the SVO
        // never has two "current" edges at once.
        await repos.entityRelation.invalidateCurrentForSubjectPredicate(
          projectId,
          subjectId,
          obs.predicate,
          objectId,
        )
        await repos.entityRelation.upsertCurrent({
          projectId,
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
          (project_id, memory_item_id, event_type, source_surface, payload)
         VALUES ($1::uuid, $2::uuid, 'observation_created', 'worker',
                 jsonb_build_object('observation_id', $3::text,
                                    'confidence', $4::double precision,
                                    'is_svo', $5::boolean))`,
        [
          projectId,
          itemId,
          created.id,
          obs.confidence ?? 1.0,
          Boolean(subjectId && obs.predicate),
        ],
      )
    }

    if (ranFullExtraction) {
      await repos.provider.query(
        `UPDATE memory_items
         SET enrichment_status = 'done',
             enrichment_version = $2,
             enriched_at = now(),
             enrichment_error = NULL
         WHERE id = $1`,
        [itemId, PIPELINE_VERSION],
      )
    } else {
      // Embed-only success: revert to 'pending' so a FULL tick later claims
      // this row for extraction. Pickup query in `tick()` adds an
      // `embedding IS NULL` guard in embed-only mode so we don't loop.
      await repos.provider.query(
        `UPDATE memory_items
         SET enrichment_status = 'pending',
             enrichment_error = NULL
         WHERE id = $1`,
        [itemId],
      )
    }
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
 * Pick up at most `batchSize` pending items across all projects and process
 * them sequentially. Caller invokes this on a Vercel cron tick (or queue
 * consumer).
 */
export async function tick(
  repos: MemoryPipelineRepos,
  providers: PipelineProviders,
  options: { batchSize?: number } = {},
): Promise<ProcessItemResult[]> {
  const batchSize = Math.min(Math.max(options.batchSize ?? 25, 1), 200)
  // Pickup gated by capability so embed-only ticks don't churn through rows
  // they can't fully process (and don't pre-stamp them at version=2 which
  // would lock them out of a later FULL tick).
  const wantsExtraction = Boolean(
    providers.extractObservations || providers.extractEntities,
  )
  const rows = wantsExtraction
    ? await repos.provider.query(
        `SELECT id
         FROM memory_items
         WHERE enrichment_status IN ('pending','failed')
           AND enrichment_version < $2
         ORDER BY created_at ASC
         LIMIT $1`,
        [batchSize, PIPELINE_VERSION],
      )
    : await repos.provider.query(
        `SELECT id
         FROM memory_items
         WHERE enrichment_status IN ('pending','failed')
           AND embedding IS NULL
         ORDER BY created_at ASC
         LIMIT $1`,
        [batchSize],
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
