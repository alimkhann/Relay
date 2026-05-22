import type { DatabaseProvider } from "../store/provider"

export interface CanonicalEntityRow {
  id: string
  projectId: string
  name: string
  kind: string
  aliases: string[]
  mergedIntoId: string | null
  createdAt: string
  updatedAt: string
}

export interface EntityMentionRow {
  id: string
  memoryItemId: string
  entityId: string
  mentionText: string
  createdAt: string
}

function toEntityRow(row: Record<string, unknown>): CanonicalEntityRow {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    name: String(row.name),
    kind: String(row.kind),
    aliases: (row.aliases as string[]) ?? [],
    mergedIntoId: row.merged_into_id ? String(row.merged_into_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function toMentionRow(row: Record<string, unknown>): EntityMentionRow {
  return {
    id: String(row.id),
    memoryItemId: String(row.memory_item_id),
    entityId: String(row.entity_id),
    mentionText: String(row.mention_text),
    createdAt: String(row.created_at),
  }
}

export class EntityRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async findOrCreateByName(projectId: string, name: string, kind = "unknown"): Promise<CanonicalEntityRow> {
    const rows = await this.provider.query(
      `INSERT INTO canonical_entities (project_id, name, kind)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, lower(name)) WHERE merged_into_id IS NULL
       DO UPDATE SET updated_at = now()
       RETURNING *`,
      [projectId, name, kind],
    )
    return toEntityRow(rows[0] as Record<string, unknown>)
  }

  /**
   * Space-scoped find-or-create. Used by the memory-pipeline worker, which
   * operates per space (personal spaces have no backing project, so
   * `findOrCreateByName` with a project id can't be used). Resolves the
   * owning project_id from `spaces` (NULL for personal) so the legacy
   * project-scoped readers keep working during the cutover.
   *
   * There is no `(space_id, lower(name))` unique index, so this does a
   * SELECT-then-INSERT. The worker serializes per item via the enrichment
   * claim guard, so the race window is negligible.
   */
  async findOrCreateBySpace(spaceId: string, name: string, kind = "unknown"): Promise<CanonicalEntityRow> {
    const existing = await this.provider.query(
      `SELECT * FROM canonical_entities
       WHERE space_id = $1 AND lower(name) = lower($2) AND merged_into_id IS NULL
       LIMIT 1`,
      [spaceId, name],
    )
    if (existing.length > 0) {
      return toEntityRow(existing[0] as Record<string, unknown>)
    }
    const rows = await this.provider.query(
      `INSERT INTO canonical_entities (project_id, space_id, name, kind)
       SELECT s.project_id, s.id, $2, $3 FROM spaces s WHERE s.id = $1
       RETURNING *`,
      [spaceId, name, kind],
    )
    if (rows.length === 0) {
      throw new Error(`Space ${spaceId} not found when creating entity`)
    }
    return toEntityRow(rows[0] as Record<string, unknown>)
  }

  async listByProject(projectId: string): Promise<CanonicalEntityRow[]> {
    const rows = await this.provider.query(
      `SELECT * FROM canonical_entities WHERE project_id = $1 AND merged_into_id IS NULL ORDER BY updated_at DESC LIMIT 200`,
      [projectId],
    )
    return rows.map((r) => toEntityRow(r as Record<string, unknown>))
  }

  async addMention(
    memoryItemId: string,
    entityId: string,
    mentionText: string,
    spaceId?: string | null,
  ): Promise<EntityMentionRow> {
    // space_id is set when known (memory v2 worker path) so the row satisfies
    // the space-scoped RLS policy. Legacy callers omit it; the dual-path RLS
    // (migration 0048) authorizes those via the owning memory item's project.
    const rows = await this.provider.query(
      `INSERT INTO entity_mentions (memory_item_id, entity_id, mention_text, space_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (memory_item_id, entity_id) DO UPDATE SET mention_text = EXCLUDED.mention_text
       RETURNING *`,
      [memoryItemId, entityId, mentionText, spaceId ?? null],
    )
    return toMentionRow(rows[0] as Record<string, unknown>)
  }

  async findMentionsByEntity(entityId: string): Promise<EntityMentionRow[]> {
    const rows = await this.provider.query(
      `SELECT * FROM entity_mentions WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [entityId],
    )
    return rows.map((r) => toMentionRow(r as Record<string, unknown>))
  }

  async findMemoryIdsByEntityNames(projectId: string, names: string[]): Promise<string[]> {
    if (names.length === 0) return []
    const placeholders = names.map((_, i) => `$${i + 2}`).join(", ")
    const rows = await this.provider.query(
      `SELECT DISTINCT em.memory_item_id
       FROM entity_mentions em
       JOIN canonical_entities ce ON ce.id = em.entity_id
       WHERE ce.project_id = $1
         AND ce.merged_into_id IS NULL
         AND lower(ce.name) IN (${placeholders})
       LIMIT 50`,
      [projectId, ...names.map((n) => n.toLowerCase())],
    )
    return rows.map((r) => String((r as Record<string, unknown>).memory_item_id))
  }

  async listMentionsByProject(projectId: string): Promise<Array<{
    entityId: string
    entityName: string
    entityKind: string
    memoryItemId: string
    mentionText: string
  }>> {
    const rows = await this.provider.query(
      `SELECT
         ce.id as entity_id,
         ce.name as entity_name,
         ce.kind as entity_kind,
         em.memory_item_id,
         em.mention_text
       FROM entity_mentions em
       JOIN canonical_entities ce ON ce.id = em.entity_id
       JOIN memory_items mi ON mi.id = em.memory_item_id
       WHERE ce.project_id = $1
         AND mi.project_id = $1
         AND mi.is_archived = false
         AND ce.merged_into_id IS NULL
       ORDER BY ce.name ASC, em.created_at DESC
       LIMIT 500`,
      [projectId],
    )
    return rows.map((row) => {
      const r = row as Record<string, unknown>
      return {
        entityId: String(r.entity_id),
        entityName: String(r.entity_name),
        entityKind: String(r.entity_kind),
        memoryItemId: String(r.memory_item_id),
        mentionText: String(r.mention_text),
      }
    })
  }
}
