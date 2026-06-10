import type { DatabaseProvider } from "../store/provider"
import type { LifecycleState } from "./observation-repository"

const COLS = `id, project_id, source_entity_id, target_entity_id, relation_type,
  confidence, valid_from, valid_until, expired_at, lifecycle_state,
  source_observation_id, source_memory_item_id, metadata, created_at`

export interface EntityRelationRow {
  id: string
  projectId: string
  sourceEntityId: string
  targetEntityId: string
  relationType: string
  confidence: number
  validFrom: string
  validUntil: string | null
  expiredAt: string | null
  lifecycleState: LifecycleState
  sourceObservationId: string | null
  sourceMemoryItemId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface CreateEntityRelationInput {
  projectId: string
  sourceEntityId: string
  targetEntityId: string
  relationType: string
  confidence?: number
  validFrom?: Date | string
  sourceObservationId?: string | null
  sourceMemoryItemId?: string | null
  metadata?: Record<string, unknown>
}

function toRow(row: Record<string, unknown>): EntityRelationRow {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    sourceEntityId: String(row.source_entity_id),
    targetEntityId: String(row.target_entity_id),
    relationType: String(row.relation_type),
    confidence: Number(row.confidence ?? 1.0),
    validFrom: String(row.valid_from),
    validUntil: row.valid_until ? String(row.valid_until) : null,
    expiredAt: row.expired_at ? String(row.expired_at) : null,
    lifecycleState: String(row.lifecycle_state) as LifecycleState,
    sourceObservationId: row.source_observation_id ? String(row.source_observation_id) : null,
    sourceMemoryItemId: row.source_memory_item_id ? String(row.source_memory_item_id) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
  }
}

export class EntityRelationRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  /**
   * Upsert a current edge. If a current edge with the same
   * (source, target, relation_type) already exists, its valid_until is
   * left NULL and confidence is updated to max(old, new). The unique
   * partial index on (source, target, relation_type) WHERE valid_until IS NULL
   * guarantees only one current edge.
   */
  async upsertCurrent(input: CreateEntityRelationInput): Promise<EntityRelationRow> {
    const existing = await this.provider.query(
      `SELECT ${COLS}
       FROM entity_relations
       WHERE source_entity_id = $1 AND target_entity_id = $2 AND relation_type = $3
         AND valid_until IS NULL
       LIMIT 1`,
      [input.sourceEntityId, input.targetEntityId, input.relationType],
    )
    if (existing.length > 0) {
      const id = String((existing[0] as Record<string, unknown>).id)
      const rows = await this.provider.query(
        `UPDATE entity_relations
         SET confidence = GREATEST(confidence, COALESCE($2, confidence)),
             metadata = COALESCE($3::jsonb, metadata)
         WHERE id = $1
         RETURNING ${COLS}`,
        [
          id,
          input.confidence ?? null,
          input.metadata ? JSON.stringify(input.metadata) : null,
        ],
      )
      return toRow(rows[0] as Record<string, unknown>)
    }
    const rows = await this.provider.query(
      `INSERT INTO entity_relations
        (project_id, source_entity_id, target_entity_id, relation_type,
         confidence, valid_from, source_observation_id, source_memory_item_id, metadata)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text,
               COALESCE($5::double precision, 1.0), COALESCE($6::timestamptz, now()),
               $7::uuid, $8::uuid, COALESCE($9::jsonb, '{}'::jsonb))
       RETURNING ${COLS}`,
      [
        input.projectId,
        input.sourceEntityId,
        input.targetEntityId,
        input.relationType,
        input.confidence ?? null,
        input.validFrom ?? null,
        input.sourceObservationId ?? null,
        input.sourceMemoryItemId ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    )
    return toRow(rows[0] as Record<string, unknown>)
  }

  async invalidate(
    id: string,
    at: Date | string = new Date(),
    nextLifecycle: LifecycleState = "cooling",
  ): Promise<void> {
    await this.provider.query(
      `UPDATE entity_relations
       SET valid_until = $2, lifecycle_state = $3
       WHERE id = $1 AND valid_until IS NULL`,
      [id, at, nextLifecycle],
    )
  }

  /**
   * Close every current edge that shares (project, source, relation_type) but
   * points at a different target. Used when an SVO's object changes: the new
   * `source → newTarget` edge from `upsertCurrent` does not collide with the
   * old `source → oldTarget` edge (different target dodges the partial-unique
   * index), so without this the old edge stays current forever.
   * Returns the number of edges superseded.
   */
  async invalidateCurrentForSubjectPredicate(
    projectId: string,
    sourceEntityId: string,
    relationType: string,
    exceptTargetId: string,
    at: Date | string = new Date(),
    nextLifecycle: LifecycleState = "cooling",
  ): Promise<number> {
    const rows = await this.provider.query(
      `UPDATE entity_relations
       SET valid_until = $5::timestamptz, lifecycle_state = $6::text
       WHERE project_id = $1::uuid
         AND source_entity_id = $2::uuid
         AND relation_type = $3::text
         AND target_entity_id <> $4::uuid
         AND valid_until IS NULL
       RETURNING id`,
      [projectId, sourceEntityId, relationType, exceptTargetId, at, nextLifecycle],
    )
    return rows.length
  }

  async listByProject(
    projectId: string,
    options: { includeHistorical?: boolean; limit?: number } = {},
  ): Promise<EntityRelationRow[]> {
    const conditions = ["project_id = $1"]
    if (!options.includeHistorical) {
      conditions.push("valid_until IS NULL")
      conditions.push("lifecycle_state IN ('active','cooling')")
    }
    const limit = Math.min(Math.max(options.limit ?? 500, 1), 5000)
    const rows = await this.provider.query(
      `SELECT ${COLS}
       FROM entity_relations
       WHERE ${conditions.join(" AND ")}
       ORDER BY valid_from DESC
       LIMIT ${limit}`,
      [projectId],
    )
    return rows.map((r) => toRow(r as Record<string, unknown>))
  }

  async listForEntity(
    entityId: string,
    options: { direction?: "out" | "in" | "both"; limit?: number } = {},
  ): Promise<EntityRelationRow[]> {
    const direction = options.direction ?? "both"
    const filter =
      direction === "out"
        ? "source_entity_id = $1"
        : direction === "in"
          ? "target_entity_id = $1"
          : "(source_entity_id = $1 OR target_entity_id = $1)"
    const limit = Math.min(Math.max(options.limit ?? 200, 1), 1000)
    const rows = await this.provider.query(
      `SELECT ${COLS}
       FROM entity_relations
       WHERE ${filter} AND valid_until IS NULL
       ORDER BY confidence DESC, valid_from DESC
       LIMIT ${limit}`,
      [entityId],
    )
    return rows.map((r) => toRow(r as Record<string, unknown>))
  }
}
