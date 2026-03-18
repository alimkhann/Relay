import type { CreateMemoryItemInput, MemoryItemRow, UpdateMemoryItemInput } from "@relay/shared"

import { toMemoryRow } from "../mappers/memory-mapper"
import type { DatabaseProvider } from "../store/provider"

export interface MemorySearchResult extends MemoryItemRow {
  rank: number
}

export class MemoryRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async getById(id: string): Promise<MemoryItemRow | null> {
    const rows = await this.provider.query(
      `select *
       from memory_items
       where id = $1
       limit 1`,
      [id]
    )

    const row = rows[0]
    return row ? toMemoryRow(row as Record<string, unknown>) : null
  }

  async listByProject(projectId: string): Promise<MemoryItemRow[]> {
    const rows = await this.provider.query(
      `select *
       from memory_items
       where project_id = $1
         and is_archived = false
       order by pinned desc, updated_at desc`,
      [projectId]
    )

    return rows.map((record) => toMemoryRow(record as Record<string, unknown>))
  }

  async create(userId: string, input: CreateMemoryItemInput): Promise<MemoryItemRow> {
    const rows = await this.provider.query(
      `insert into memory_items (project_id, source_turn_id, type, title, content, pinned, tags, metadata, created_by, source_surface, source_conversation_id, source_url, captured_at, derived_from)
       values ($1, $2, $3, $4, $5, $6, $7::text[], $8::jsonb, $9, $10, $11, $12, coalesce($13::timestamptz, now()), $14::text[])
       returning *`,
      [
        input.projectId,
        input.sourceTurnId ?? null,
        input.type,
        input.title ?? null,
        input.content,
        input.pinned ?? false,
        input.tags ?? [],
        JSON.stringify(input.metadata ?? {}),
        userId,
        input.sourceSurface ?? null,
        input.sourceConversationId ?? null,
        input.sourceUrl ?? null,
        input.capturedAt ?? null,
        input.derivedFrom ?? null
      ]
    )

    return toMemoryRow(rows[0] as Record<string, unknown>)
  }

  async createBatch(userId: string, items: CreateMemoryItemInput[]): Promise<MemoryItemRow[]> {
    if (items.length === 0) return []

    const placeholders: string[] = []
    const params: unknown[] = []
    let paramIndex = 1

    for (const item of items) {
      placeholders.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}::text[], $${paramIndex + 7}::jsonb, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10}, $${paramIndex + 11}, coalesce($${paramIndex + 12}::timestamptz, now()), $${paramIndex + 13}::text[])`
      )
      params.push(
        item.projectId,
        item.sourceTurnId ?? null,
        item.type,
        item.title ?? null,
        item.content,
        item.pinned ?? false,
        item.tags ?? [],
        JSON.stringify(item.metadata ?? {}),
        userId,
        item.sourceSurface ?? null,
        item.sourceConversationId ?? null,
        item.sourceUrl ?? null,
        item.capturedAt ?? null,
        item.derivedFrom ?? null
      )
      paramIndex += 14
    }

    const rows = await this.provider.query(
      `insert into memory_items (project_id, source_turn_id, type, title, content, pinned, tags, metadata, created_by, source_surface, source_conversation_id, source_url, captured_at, derived_from)
       values ${placeholders.join(", ")}
       returning *`,
      params
    )

    return rows.map((record) => toMemoryRow(record as Record<string, unknown>))
  }

  async update(id: string, patch: UpdateMemoryItemInput): Promise<MemoryItemRow> {
    const rows = await this.provider.query(
      `update memory_items
       set title = case when $2::boolean then null else coalesce($3, title) end,
           content = coalesce($4, content),
           type = coalesce($5, type),
           pinned = coalesce($6, pinned),
           tags = coalesce($7::text[], tags),
           is_archived = coalesce($8, is_archived),
           updated_at = now()
       where id = $1
       returning *`,
      [id, patch.title === null, patch.title ?? null, patch.content ?? null, patch.type ?? null, patch.pinned ?? null, patch.tags ?? null, patch.isArchived ?? null]
    )

    const row = rows[0]
    if (!row) throw new Error("Memory item not found")
    return toMemoryRow(row as Record<string, unknown>)
  }

  async search(projectId: string, query: string, options?: { types?: string[]; tags?: string[]; limit?: number }): Promise<MemorySearchResult[]> {
    const limit = options?.limit ?? 20
    const conditions = [
      "project_id = $1",
      "is_archived = false",
      "search_vector @@ plainto_tsquery('english', $2)"
    ]
    const params: unknown[] = [projectId, query]
    let paramIndex = 3

    if (options?.types?.length) {
      conditions.push(`type = ANY($${paramIndex}::text[])`)
      params.push(options.types)
      paramIndex++
    }

    if (options?.tags?.length) {
      conditions.push(`tags && $${paramIndex}::text[]`)
      params.push(options.tags)
      paramIndex++
    }

    params.push(limit)

    const rows = await this.provider.query(
      `select *, ts_rank(search_vector, plainto_tsquery('english', $2)) as rank
       from memory_items
       where ${conditions.join(" and ")}
       order by pinned desc, rank desc
       limit $${paramIndex}`,
      params
    )

    return rows.map((record) => {
      const row = record as Record<string, unknown>
      return {
        ...toMemoryRow(row),
        rank: Number(row.rank ?? 0)
      }
    })
  }

  async remove(id: string): Promise<void> {
    await this.provider.query(
      `update memory_items
       set is_archived = true,
           updated_at = now()
       where id = $1`,
      [id]
    )
  }
}
