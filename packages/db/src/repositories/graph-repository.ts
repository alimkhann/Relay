import type { DatabaseProvider } from "../store/provider"

export interface ExpandedEntity {
  entityId: string
  name: string
  hops: number
  via: string[] // relation types traversed to reach this node
}

export interface SpaceGraphSnapshot {
  entities: Array<{ id: string; name: string; kind: string }>
  relations: Array<{
    id: string
    sourceEntityId: string
    targetEntityId: string
    relationType: string
    confidence: number
  }>
  entityMentions: Array<{ entityId: string; memoryItemId: string }>
}

/**
 * Graph-flavored queries over canonical_entities + entity_relations +
 * entity_mentions. Recursive CTE traversal replaces Neo4j-style Cypher at
 * Relay's scale.
 */
export class GraphRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  /**
   * Expand outward from a seed set of entities up to `maxHops` (default 2),
   * following currently-valid entity_relations only. Returned entities are
   * deduped and stamped with the minimum number of hops needed to reach
   * them from the seed set.
   */
  async expandFromEntities(
    spaceId: string,
    seedEntityIds: string[],
    maxHops = 2,
  ): Promise<ExpandedEntity[]> {
    if (seedEntityIds.length === 0) return []
    const cappedHops = Math.min(Math.max(maxHops, 1), 4)
    const rows = await this.provider.query(
      `WITH RECURSIVE walk AS (
         SELECT
           ce.id AS entity_id,
           ce.name AS name,
           0 AS hops,
           ARRAY[]::text[] AS via
         FROM canonical_entities ce
         WHERE ce.id = ANY($2::uuid[])
           AND ce.space_id = $1
         UNION ALL
         SELECT
           CASE WHEN er.source_entity_id = w.entity_id THEN er.target_entity_id ELSE er.source_entity_id END AS entity_id,
           ce2.name AS name,
           w.hops + 1 AS hops,
           w.via || er.relation_type AS via
         FROM walk w
         JOIN entity_relations er
           ON (er.source_entity_id = w.entity_id OR er.target_entity_id = w.entity_id)
          AND er.space_id = $1
          AND er.valid_until IS NULL
          AND er.lifecycle_state IN ('active','cooling')
         JOIN canonical_entities ce2
           ON ce2.id = CASE WHEN er.source_entity_id = w.entity_id THEN er.target_entity_id ELSE er.source_entity_id END
          AND ce2.space_id = $1
         WHERE w.hops < $3
       )
       SELECT entity_id, name, MIN(hops) AS hops, (array_agg(via))[1] AS via
       FROM walk
       GROUP BY entity_id, name
       ORDER BY MIN(hops) ASC, name ASC
       LIMIT 200`,
      [spaceId, seedEntityIds, cappedHops],
    )
    return rows.map((row) => {
      const r = row as Record<string, unknown>
      return {
        entityId: String(r.entity_id),
        name: String(r.name),
        hops: Number(r.hops),
        via: (r.via as string[]) ?? [],
      }
    })
  }

  /**
   * Find memory_items mentioned by any entity within the expanded set.
   * Used by recall to bring in entity-adjacent memories.
   */
  async memoryIdsForEntities(
    spaceId: string,
    entityIds: string[],
    limit = 50,
  ): Promise<string[]> {
    if (entityIds.length === 0) return []
    const rows = await this.provider.query(
      `SELECT DISTINCT em.memory_item_id
       FROM entity_mentions em
       JOIN memory_items mi ON mi.id = em.memory_item_id
       WHERE em.entity_id = ANY($2::uuid[])
         AND em.space_id = $1
         AND mi.lifecycle_state IN ('active','cooling')
       LIMIT $3`,
      [spaceId, entityIds, limit],
    )
    return rows.map((r) => String((r as Record<string, unknown>).memory_item_id))
  }

  /**
   * Snapshot used by the dashboard graph view. Returns first-class entities,
   * their currently-valid relations, and the entity↔memory mention links.
   * Replaces the synthetic-hub fallback in memory-graph-utils.ts once the
   * payload is non-empty.
   */
  async getSpaceGraphSnapshot(spaceId: string, limit = 200): Promise<SpaceGraphSnapshot> {
    const entityRows = await this.provider.query(
      `SELECT id, name, kind
       FROM canonical_entities
       WHERE space_id = $1
         AND merged_into_id IS NULL
       ORDER BY updated_at DESC
       LIMIT $2`,
      [spaceId, limit],
    )
    const relationRows = await this.provider.query(
      `SELECT id, source_entity_id, target_entity_id, relation_type, confidence
       FROM entity_relations
       WHERE space_id = $1
         AND valid_until IS NULL
         AND lifecycle_state IN ('active','cooling')
       ORDER BY valid_from DESC
       LIMIT $2`,
      [spaceId, limit * 4],
    )
    const mentionRows = await this.provider.query(
      `SELECT em.entity_id, em.memory_item_id
       FROM entity_mentions em
       JOIN memory_items mi ON mi.id = em.memory_item_id
       WHERE em.space_id = $1
         AND mi.lifecycle_state IN ('active','cooling')
       LIMIT $2`,
      [spaceId, limit * 6],
    )
    return {
      entities: entityRows.map((row) => {
        const r = row as Record<string, unknown>
        return { id: String(r.id), name: String(r.name), kind: String(r.kind) }
      }),
      relations: relationRows.map((row) => {
        const r = row as Record<string, unknown>
        return {
          id: String(r.id),
          sourceEntityId: String(r.source_entity_id),
          targetEntityId: String(r.target_entity_id),
          relationType: String(r.relation_type),
          confidence: Number(r.confidence ?? 1.0),
        }
      }),
      entityMentions: mentionRows.map((row) => {
        const r = row as Record<string, unknown>
        return {
          entityId: String(r.entity_id),
          memoryItemId: String(r.memory_item_id),
        }
      }),
    }
  }
}
