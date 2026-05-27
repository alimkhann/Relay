import type { DatabaseProvider } from "../store/provider"

export type LifecycleState = "active" | "cooling" | "archived" | "forgotten"

const OBSERVATION_COLS = `id, space_id, source_episode_id, source_memory_item_id, content,
  subject_entity_id, predicate, object_entity_id, object_literal,
  valid_from, valid_until, expired_at, lifecycle_state, embedding_model,
  confidence, metadata, created_at, enrichment_status, enrichment_version, enriched_at,
  (embedding is not null) as has_embedding`

export interface ObservationRow {
  id: string
  spaceId: string
  sourceEpisodeId: string | null
  sourceMemoryItemId: string | null
  content: string
  subjectEntityId: string | null
  predicate: string | null
  objectEntityId: string | null
  objectLiteral: string | null
  validFrom: string
  validUntil: string | null
  expiredAt: string | null
  lifecycleState: LifecycleState
  confidence: number
  metadata: Record<string, unknown>
  createdAt: string
  enrichmentStatus: "pending" | "running" | "done" | "failed"
  enrichmentVersion: number
  enrichedAt: string | null
  /** True when the embedding vector is populated — lets the worker skip re-embed. */
  hasEmbedding: boolean
}

export interface CreateObservationInput {
  spaceId: string
  content: string
  sourceEpisodeId?: string | null
  sourceMemoryItemId?: string | null
  subjectEntityId?: string | null
  predicate?: string | null
  objectEntityId?: string | null
  objectLiteral?: string | null
  validFrom?: Date | string
  confidence?: number
  metadata?: Record<string, unknown>
  lifecycleState?: LifecycleState
}

export interface ObservationSearchResult extends ObservationRow {
  similarity: number
  matchType: "semantic" | "lexical"
}

function toRow(row: Record<string, unknown>): ObservationRow {
  return {
    id: String(row.id),
    spaceId: String(row.space_id),
    sourceEpisodeId: row.source_episode_id ? String(row.source_episode_id) : null,
    sourceMemoryItemId: row.source_memory_item_id ? String(row.source_memory_item_id) : null,
    content: String(row.content),
    subjectEntityId: row.subject_entity_id ? String(row.subject_entity_id) : null,
    predicate: row.predicate ? String(row.predicate) : null,
    objectEntityId: row.object_entity_id ? String(row.object_entity_id) : null,
    objectLiteral: row.object_literal ? String(row.object_literal) : null,
    validFrom: String(row.valid_from),
    validUntil: row.valid_until ? String(row.valid_until) : null,
    expiredAt: row.expired_at ? String(row.expired_at) : null,
    lifecycleState: String(row.lifecycle_state) as LifecycleState,
    confidence: Number(row.confidence ?? 1.0),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
    enrichmentStatus: String(row.enrichment_status ?? "pending") as ObservationRow["enrichmentStatus"],
    enrichmentVersion: Number(row.enrichment_version ?? 0),
    enrichedAt: row.enriched_at ? String(row.enriched_at) : null,
    hasEmbedding: Boolean(row.has_embedding),
  }
}

export class ObservationRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async create(input: CreateObservationInput): Promise<ObservationRow> {
    const rows = await this.provider.query(
      `INSERT INTO observations
        (space_id, content, source_episode_id, source_memory_item_id,
         subject_entity_id, predicate, object_entity_id, object_literal,
         valid_from, confidence, metadata, lifecycle_state)
       VALUES ($1::uuid, $2::text, $3::uuid, $4::uuid,
               $5::uuid, $6::text, $7::uuid, $8::text,
               COALESCE($9::timestamptz, now()), COALESCE($10::double precision, 1.0),
               COALESCE($11::jsonb, '{}'::jsonb), COALESCE($12::text, 'active'))
       RETURNING ${OBSERVATION_COLS}`,
      [
        input.spaceId,
        input.content,
        input.sourceEpisodeId ?? null,
        input.sourceMemoryItemId ?? null,
        input.subjectEntityId ?? null,
        input.predicate ?? null,
        input.objectEntityId ?? null,
        input.objectLiteral ?? null,
        input.validFrom ?? null,
        input.confidence ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.lifecycleState ?? null,
      ],
    )
    return toRow(rows[0] as Record<string, unknown>)
  }

  async getById(id: string): Promise<ObservationRow | null> {
    const rows = await this.provider.query(
      `SELECT ${OBSERVATION_COLS} FROM observations WHERE id = $1 LIMIT 1`,
      [id],
    )
    return rows.length === 0 ? null : toRow(rows[0] as Record<string, unknown>)
  }

  /**
   * List observations currently true in this space (valid_until IS NULL),
   * with default lifecycle filter (active by default).
   */
  async listBySpace(
    spaceId: string,
    options: {
      lifecycleStates?: LifecycleState[]
      includeHistorical?: boolean
      limit?: number
    } = {},
  ): Promise<ObservationRow[]> {
    const conditions = ["space_id = $1"]
    const params: unknown[] = [spaceId]
    let i = 2

    if (!options.includeHistorical) {
      conditions.push("valid_until IS NULL")
    }
    const states = options.lifecycleStates ?? ["active"]
    conditions.push(`lifecycle_state = ANY($${i}::text[])`)
    params.push(states)
    i += 1

    const limit = Math.min(Math.max(options.limit ?? 200, 1), 1000)
    const rows = await this.provider.query(
      `SELECT ${OBSERVATION_COLS}
       FROM observations
       WHERE ${conditions.join(" AND ")}
       ORDER BY valid_from DESC
       LIMIT ${limit}`,
      params,
    )
    return rows.map((r) => toRow(r as Record<string, unknown>))
  }

  /**
   * SVO conflict lookup. Returns the current observation (valid_until IS NULL)
   * that shares (subject_entity_id, predicate) with the input. The worker uses
   * this to close the prior validity window when a contradicting SVO arrives.
   */
  async findCurrentSvo(
    spaceId: string,
    subjectEntityId: string,
    predicate: string,
  ): Promise<ObservationRow | null> {
    const rows = await this.provider.query(
      `SELECT ${OBSERVATION_COLS}
       FROM observations
       WHERE space_id = $1
         AND subject_entity_id = $2
         AND predicate = $3
         AND valid_until IS NULL
         AND lifecycle_state IN ('active','cooling')
       ORDER BY valid_from DESC
       LIMIT 1`,
      [spaceId, subjectEntityId, predicate],
    )
    return rows.length === 0 ? null : toRow(rows[0] as Record<string, unknown>)
  }

  /**
   * Close an observation's validity window (and optionally cool it) when a
   * newer fact supersedes it.
   */
  async invalidate(
    id: string,
    at: Date | string = new Date(),
    nextLifecycle: LifecycleState = "cooling",
  ): Promise<void> {
    await this.provider.query(
      `UPDATE observations
       SET valid_until = $2, lifecycle_state = $3
       WHERE id = $1 AND valid_until IS NULL`,
      [id, at, nextLifecycle],
    )
  }

  async updateEmbedding(
    id: string,
    embedding: number[],
    model: string,
  ): Promise<void> {
    await this.provider.query(
      `UPDATE observations
       SET embedding = $2::vector, embedding_model = $3,
           enrichment_status = 'done', enriched_at = now(),
           enrichment_version = enrichment_version + 1
       WHERE id = $1`,
      [id, JSON.stringify(embedding), model],
    )
  }

  /**
   * Hybrid search: semantic (pgvector) + lexical (tsvector) fused with
   * Reciprocal Rank Fusion. RRF avoids mixing incomparable score scales
   * (cosine [0,1] vs unbounded ts_rank) by ranking each channel independently
   * and summing 1/(k + rank). `similarity` on the result is the RRF score.
   * Returns currently-valid active observations by default.
   */
  async hybridSearch(
    spaceId: string,
    queryEmbedding: number[] | null,
    queryText: string,
    options: {
      limit?: number
      includeHistorical?: boolean
      lifecycleStates?: LifecycleState[]
    } = {},
  ): Promise<ObservationSearchResult[]> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100)
    const states = options.lifecycleStates ?? ["active"]
    const historicalFilter = options.includeHistorical ? "" : "AND valid_until IS NULL"
    const RRF_K = 60
    const params: unknown[] = [spaceId, states, limit]

    let semanticCte = ""
    let semanticUnion = ""
    if (queryEmbedding) {
      params.push(JSON.stringify(queryEmbedding))
      const vecIdx = params.length
      semanticCte = `,
        semantic AS (
          SELECT id, row_number() OVER (ORDER BY embedding <=> $${vecIdx}::vector) AS rank
          FROM observations
          WHERE space_id = $1
            AND embedding IS NOT NULL
            AND lifecycle_state = ANY($2::text[])
            ${historicalFilter}
          ORDER BY embedding <=> $${vecIdx}::vector
          LIMIT $3 * 2
        )`
      semanticUnion = `
        UNION ALL
        SELECT id, 1.0 / (${RRF_K} + rank) AS rrf, 'semantic' AS match_type FROM semantic`
    }

    params.push(queryText)
    const lexIdx = params.length
    const rows = await this.provider.query(
      `WITH lexical AS (
        SELECT id, row_number() OVER (
                 ORDER BY ts_rank(search_vector, plainto_tsquery('english', $${lexIdx})) DESC
               ) AS rank
        FROM observations
        WHERE space_id = $1
          AND search_vector @@ plainto_tsquery('english', $${lexIdx})
          AND lifecycle_state = ANY($2::text[])
          ${historicalFilter}
        ORDER BY ts_rank(search_vector, plainto_tsquery('english', $${lexIdx})) DESC
        LIMIT $3 * 2
      )${semanticCte},
      ranked AS (
        SELECT id, 1.0 / (${RRF_K} + rank) AS rrf, 'lexical' AS match_type FROM lexical
        ${semanticUnion}
      ),
      fused AS (
        SELECT id AS fid,
               SUM(rrf) AS score,
               CASE WHEN bool_or(match_type = 'semantic') THEN 'semantic' ELSE 'lexical' END AS match_type
        FROM ranked
        GROUP BY id
      )
      SELECT ${OBSERVATION_COLS}, f.score AS similarity, f.match_type
      FROM observations
      JOIN fused f ON f.fid = observations.id
      ORDER BY f.score DESC
      LIMIT $3`,
      params,
    )
    return rows.map((row) => {
      const r = row as Record<string, unknown>
      return {
        ...toRow(r),
        similarity: Number(r.similarity ?? 0),
        matchType: String(r.match_type ?? "lexical") as ObservationSearchResult["matchType"],
      }
    })
  }

  /** Worker pickup query — observations awaiting enrichment. */
  async listPendingEnrichment(limit = 50): Promise<ObservationRow[]> {
    const rows = await this.provider.query(
      `SELECT ${OBSERVATION_COLS}
       FROM observations
       WHERE enrichment_status IN ('pending','failed')
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit],
    )
    return rows.map((r) => toRow(r as Record<string, unknown>))
  }

  async setLifecycle(id: string, lifecycle: LifecycleState): Promise<void> {
    await this.provider.query(
      `UPDATE observations SET lifecycle_state = $2 WHERE id = $1`,
      [id, lifecycle],
    )
  }
}
