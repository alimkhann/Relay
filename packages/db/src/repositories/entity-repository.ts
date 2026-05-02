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

  async listByProject(projectId: string): Promise<CanonicalEntityRow[]> {
    const rows = await this.provider.query(
      `SELECT * FROM canonical_entities WHERE project_id = $1 AND merged_into_id IS NULL ORDER BY updated_at DESC LIMIT 200`,
      [projectId],
    )
    return rows.map((r) => toEntityRow(r as Record<string, unknown>))
  }

  async addMention(memoryItemId: string, entityId: string, mentionText: string): Promise<EntityMentionRow> {
    const rows = await this.provider.query(
      `INSERT INTO entity_mentions (memory_item_id, entity_id, mention_text)
       VALUES ($1, $2, $3)
       ON CONFLICT (memory_item_id, entity_id) DO UPDATE SET mention_text = EXCLUDED.mention_text
       RETURNING *`,
      [memoryItemId, entityId, mentionText],
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
}
