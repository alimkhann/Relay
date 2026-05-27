import type { CreateMemoryItemInput, MemoryItemRow, MemoryItemType, MemoryRelationRow, MemoryRelationType, UpdateMemoryItemInput } from "@relay/shared"

import { toMemoryRelationRow, toMemoryRow } from "../mappers/memory-mapper"
import type { DatabaseProvider } from "../store/provider"
import { decryptTextIfNeeded, encryptTextIfConfigured } from "../utils/encrypted-text"

/** Columns to select for general memory queries — excludes large/internal index columns. */
const MEMORY_COLS = `id, project_id, space_id, source_turn_id, type, title, content, pinned, is_archived, sort_order, tags, metadata, created_by, created_at, updated_at, source_surface, source_conversation_id, source_url, captured_at, derived_from, embedding_model, forget_after, last_reaffirmed_at, lifecycle_state`

const compactionPenaltyExpr = (alias = "m") => `case ${alias}.metadata->>'compactionState'
  when 'covered_by_canon' then 0.45
  when 'covered_by_summary' then 0.65
  when 'historical_only' then 0.40
  when 'completed' then 0.30
  else 1.0
end`

/** Same columns but prefixed with a table alias for JOINed queries */
function prefixCols(alias: string) {
  return MEMORY_COLS.split(", ").map((c) => `${alias}.${c}`).join(", ")
}

export interface MemorySearchResult extends MemoryItemRow {
  rank: number
}

/** Scope + lifecycle options shared by the read/search paths (Memory v2). */
interface ScopeLifecycleOptions {
  /** When set, scope by space_id instead of project_id (personal-space recall). */
  spaceId?: string
  /** Explicit lifecycle filter. Defaults to ['active','cooling']; 'forgotten' is always excluded. */
  lifecycleStates?: string[]
  /** Convenience flag: add 'archived' to the default lifecycle set. Ignored when lifecycleStates is set. */
  includeArchived?: boolean
}

/**
 * Resolve the allowed lifecycle_state list for a read query. Default keeps the
 * legacy `is_archived = false` behavior (active + cooling). 'forgotten' is never
 * returned.
 */
function resolveLifecycleStates(options?: ScopeLifecycleOptions): string[] {
  if (options?.lifecycleStates?.length) {
    return options.lifecycleStates.filter((s) => s !== "forgotten")
  }
  const base = ["active", "cooling"]
  if (options?.includeArchived) base.push("archived")
  return base
}

export interface SemanticSearchResult extends MemoryItemRow {
  similarity: number
  matchType: "semantic" | "lexical"
}

export class MemoryRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async countByProject(projectId: string, options: { includeArchived?: boolean } = {}): Promise<number> {
    const rows = await this.provider.query(
      `select count(*)::int as count
       from memory_items
       where project_id = $1
         and ($2::boolean or is_archived = false)`,
      [projectId, options.includeArchived ?? false]
    )

    return Number((rows[0] as Record<string, unknown> | undefined)?.count ?? 0)
  }

  async listRoutingSamplesByProject(projectId: string, limit = 3): Promise<Array<{ title: string | null; content: string }>> {
    const rows = await this.provider.query(
      `select title, content
       from memory_items
       where project_id = $1
         and is_archived = false
       order by pinned desc, updated_at desc
       limit $2`,
      [projectId, limit]
    )

    return rows.map((row) => {
      const record = row as Record<string, unknown>
      return {
        title: record.title ? String(record.title) : null,
        content: decryptTextIfNeeded(String(record.content ?? "")),
      }
    })
  }

  async getById(id: string): Promise<MemoryItemRow | null> {
    const rows = await this.provider.query(
      `select ${MEMORY_COLS}
       from memory_items
       where id = $1
       limit 1`,
      [id]
    )

    const row = rows[0]
    return row ? toMemoryRow(row as Record<string, unknown>) : null
  }

  async listByProject(
    projectId: string,
    options: {
      includeArchived?: boolean
      types?: MemoryItemType[]
      tag?: string
      pinned?: boolean
      limit?: number
      sort?: "updated_desc" | "created_desc"
    } = {},
  ): Promise<MemoryItemRow[]> {
    const conditions = ["project_id = $1"]
    const params: unknown[] = [projectId]
    let paramIndex = 2

    if (!options.includeArchived) {
      conditions.push("is_archived = false")
    }

    if (options.types?.length) {
      conditions.push(`type = ANY($${paramIndex}::text[])`)
      params.push(options.types)
      paramIndex += 1
    }

    if (options.tag) {
      conditions.push(`$${paramIndex} = ANY(tags)`)
      params.push(options.tag)
      paramIndex += 1
    }

    if (typeof options.pinned === "boolean") {
      conditions.push(`pinned = $${paramIndex}`)
      params.push(options.pinned)
      paramIndex += 1
    }

    const orderBy = options.sort === "created_desc"
      ? "pinned desc, created_at desc"
      : "pinned desc, updated_at desc"

    let limitClause = ""
    if (typeof options.limit === "number") {
      params.push(options.limit)
      limitClause = ` limit $${paramIndex}`
    }

    const rows = await this.provider.query(
      `select ${MEMORY_COLS}
       from memory_items
       where ${conditions.join(" and ")}
       order by ${orderBy}${limitClause}`,
      params
    )

    return rows.map((record) => toMemoryRow(record as Record<string, unknown>))
  }

  /**
   * Memory v2: list items by space (personal or project). Returns the typed,
   * decrypted `MemoryItemRow` shape — never raw DB columns. Active + cooling
   * by default; forgotten/archived excluded unless requested.
   */
  async listBySpace(
    spaceId: string,
    options: {
      lifecycleStates?: string[]
      limit?: number
    } = {},
  ): Promise<MemoryItemRow[]> {
    const states = options.lifecycleStates ?? ["active", "cooling"]
    const limit = Math.min(Math.max(options.limit ?? 200, 1), 1000)
    const rows = await this.provider.query(
      `select ${MEMORY_COLS}
       from memory_items
       where space_id = $1
         and lifecycle_state = any($2::text[])
       order by pinned desc, updated_at desc
       limit $3`,
      [spaceId, states, limit],
    )
    return rows.map((record) => toMemoryRow(record as Record<string, unknown>))
  }

  async create(userId: string, input: CreateMemoryItemInput): Promise<MemoryItemRow> {
    const plaintextContent = input.content
    const encryptedContent = encryptTextIfConfigured(plaintextContent)

    const rows = await this.provider.query(
      `insert into memory_items (project_id, space_id, source_turn_id, type, title, content, pinned, tags, metadata, created_by, source_surface, source_conversation_id, source_url, captured_at, derived_from, search_vector, forget_after, valid_from)
       values ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9::jsonb, $10, $11, $12, $13, coalesce($14::timestamptz, now()), $15::text[], to_tsvector('english', coalesce($5, '') || ' ' || $16), $17::timestamptz, coalesce($14::timestamptz, now()))
       returning ${MEMORY_COLS}`,
      [
        input.projectId ?? null,
        input.spaceId ?? null,
        input.sourceTurnId ?? null,
        input.type,
        input.title ?? null,
        encryptedContent,
        input.pinned ?? false,
        input.tags ?? [],
        JSON.stringify(input.metadata ?? {}),
        userId,
        input.sourceSurface ?? null,
        input.sourceConversationId ?? null,
        input.sourceUrl ?? null,
        input.capturedAt ?? null,
        input.derivedFrom ?? null,
        plaintextContent,
        input.forgetAfter ?? null
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
      const plaintextContent = item.content
      const encryptedContent = encryptTextIfConfigured(plaintextContent)

      placeholders.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}::text[], $${paramIndex + 7}::jsonb, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10}, $${paramIndex + 11}, coalesce($${paramIndex + 12}::timestamptz, now()), $${paramIndex + 13}::text[], to_tsvector('english', coalesce($${paramIndex + 3}, '') || ' ' || $${paramIndex + 14}), $${paramIndex + 15}::timestamptz)`
      )
      params.push(
        item.projectId,
        item.sourceTurnId ?? null,
        item.type,
        item.title ?? null,
        encryptedContent,
        item.pinned ?? false,
        item.tags ?? [],
        JSON.stringify(item.metadata ?? {}),
        userId,
        item.sourceSurface ?? null,
        item.sourceConversationId ?? null,
        item.sourceUrl ?? null,
        item.capturedAt ?? null,
        item.derivedFrom ?? null,
        plaintextContent,
        item.forgetAfter ?? null
      )
      paramIndex += 16
    }

    const rows = await this.provider.query(
      `insert into memory_items (project_id, source_turn_id, type, title, content, pinned, tags, metadata, created_by, source_surface, source_conversation_id, source_url, captured_at, derived_from, search_vector, forget_after)
       values ${placeholders.join(", ")}
       returning ${MEMORY_COLS}`,
      params
    )

    return rows.map((record) => toMemoryRow(record as Record<string, unknown>))
  }

  async update(id: string, patch: UpdateMemoryItemInput): Promise<MemoryItemRow> {
    const plaintextContent = patch.content ?? null
    const encryptedContent = plaintextContent ? encryptTextIfConfigured(plaintextContent) : null

    const rows = await this.provider.query(
      `update memory_items
       set title = case when $2::boolean then null else coalesce($3, title) end,
            content = case when $21::boolean then '' else coalesce($4, content) end,
            type = coalesce($5, type),
            pinned = coalesce($6, pinned),
            tags = coalesce($7::text[], tags),
            is_archived = coalesce($8, is_archived),
            metadata = coalesce($9::jsonb, metadata),
            source_conversation_id = case when $10::boolean then null else coalesce($11, source_conversation_id) end,
            source_url = case when $12::boolean then null else coalesce($13, source_url) end,
            captured_at = case when $14::boolean then null else coalesce($15::timestamptz, captured_at) end,
            derived_from = case when $16::boolean then null else coalesce($17::text[], derived_from) end,
            search_vector = case
              when $21::boolean then to_tsvector('english', '')
              when $18::text is not null then to_tsvector('english', coalesce(case when $2::boolean then null else coalesce($3, title) end, '') || ' ' || $18)
              else search_vector end,
            forget_after = case when $19::boolean then null else coalesce($20::timestamptz, forget_after) end,
            -- Memory v2 lifecycle columns (atomic with the rest of the patch).
            lifecycle_state = coalesce($22, lifecycle_state),
            valid_until = case when $23::boolean then null else coalesce($24::timestamptz, valid_until) end,
            last_reaffirmed_at = case when $25::boolean then null else coalesce($26::timestamptz, last_reaffirmed_at) end,
            updated_at = now()
        where id = $1
        returning ${MEMORY_COLS}`,
      [
        id,
        patch.title === null,
        patch.title ?? null,
        encryptedContent,
        patch.type ?? null,
        patch.pinned ?? null,
        patch.tags ?? null,
        patch.isArchived ?? null,
        patch.metadata ? JSON.stringify(patch.metadata) : null,
        patch.sourceConversationId === null,
        patch.sourceConversationId ?? null,
        patch.sourceUrl === null,
        patch.sourceUrl ?? null,
        patch.capturedAt === null,
        patch.capturedAt ?? null,
        patch.derivedFrom === null,
        patch.derivedFrom ?? null,
        plaintextContent,
        patch.forgetAfter === null,
        patch.forgetAfter ?? null,
        patch.nullContent ?? false,
        patch.lifecycleState ?? null,
        patch.validUntil === null,
        patch.validUntil ?? null,
        patch.lastReaffirmedAt === null,
        patch.lastReaffirmedAt ?? null,
      ]
    )

    const row = rows[0]
    if (!row) throw new Error("Memory item not found")
    return toMemoryRow(row as Record<string, unknown>)
  }

  async search(projectId: string, query: string, options?: { types?: string[]; tags?: string[]; limit?: number } & ScopeLifecycleOptions): Promise<MemorySearchResult[]> {
    const limit = options?.limit ?? 20
    const scopeColumn = options?.spaceId ? "space_id" : "project_id"
    const scopeId = options?.spaceId ?? projectId
    const lifecycleStates = resolveLifecycleStates(options)
    const conditions = [
      `${scopeColumn} = $1`,
      "lifecycle_state = ANY($3::text[])",
      "search_vector @@ plainto_tsquery('english', $2)"
    ]
    const params: unknown[] = [scopeId, query, lifecycleStates]
    let paramIndex = 4

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
      `select ${MEMORY_COLS}, ts_rank(search_vector, plainto_tsquery('english', $2)) * ${compactionPenaltyExpr("memory_items")} as rank
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

  /* ─── Embedding operations ─── */

  async updateEmbedding(id: string, embedding: number[], model: string): Promise<void> {
    await this.provider.query(
      `update memory_items
       set embedding = $2::vector,
           embedding_model = $3,
           updated_at = now()
       where id = $1`,
      [id, JSON.stringify(embedding), model]
    )
  }

  async updateEmbeddingsBatch(items: Array<{ id: string; embedding: number[]; model: string }>): Promise<void> {
    if (items.length === 0) return

    const cases: string[] = []
    const modelCases: string[] = []
    const ids: string[] = []
    const params: unknown[] = []
    let paramIndex = 1

    for (const item of items) {
      cases.push(`when id = $${paramIndex} then $${paramIndex + 1}::vector`)
      modelCases.push(`when id = $${paramIndex} then $${paramIndex + 2}`)
      ids.push(item.id)
      params.push(item.id, JSON.stringify(item.embedding), item.model)
      paramIndex += 3
    }

    params.push(ids)

    await this.provider.query(
      `update memory_items
       set embedding = case ${cases.join(" ")} end,
           embedding_model = case ${modelCases.join(" ")} end,
           updated_at = now()
       where id = any($${paramIndex}::uuid[])`,
      params
    )
  }

  async findSimilar(itemId: string, options?: { threshold?: number; limit?: number }): Promise<SemanticSearchResult[]> {
    const threshold = options?.threshold ?? 0.7
    const limit = options?.limit ?? 10

    const rows = await this.provider.query(
      `select ${prefixCols("m")}, 1 - (m.embedding <=> ref.embedding) as similarity
       from memory_items m, memory_items ref
       where ref.id = $1
         and m.id != $1
         and m.project_id = ref.project_id
         and m.is_archived = false
         and m.embedding is not null
         and ref.embedding is not null
         and 1 - (m.embedding <=> ref.embedding) >= $2
       order by m.embedding <=> ref.embedding
       limit $3`,
      [itemId, threshold, limit]
    )

    return rows.map((record) => {
      const row = record as Record<string, unknown>
      return {
        ...toMemoryRow(row),
        similarity: Number(row.similarity ?? 0),
        matchType: "semantic" as const
      }
    })
  }

  async semanticSearch(projectId: string, queryEmbedding: number[], options?: {
    threshold?: number
    limit?: number
    types?: string[]
  }): Promise<SemanticSearchResult[]> {
    const threshold = options?.threshold ?? 0.6
    const limit = options?.limit ?? 20
    const conditions = [
      "project_id = $1",
      "is_archived = false",
      "embedding is not null",
      `1 - (embedding <=> $2::vector) >= $3`
    ]
    const params: unknown[] = [projectId, JSON.stringify(queryEmbedding), threshold]
    let paramIndex = 4

    if (options?.types?.length) {
      conditions.push(`type = ANY($${paramIndex}::text[])`)
      params.push(options.types)
      paramIndex++
    }

    params.push(limit)

    const rows = await this.provider.query(
      `select ${MEMORY_COLS}, 1 - (embedding <=> $2::vector) as similarity
       from memory_items
       where ${conditions.join(" and ")}
       order by embedding <=> $2::vector
       limit $${paramIndex}`,
      params
    )

    return rows.map((record) => {
      const row = record as Record<string, unknown>
      return {
        ...toMemoryRow(row),
        similarity: Number(row.similarity ?? 0),
        matchType: "semantic" as const
      }
    })
  }

  async hybridSearch(projectId: string, query: string, queryEmbedding: number[], options?: {
    threshold?: number
    limit?: number
    types?: string[]
    tags?: string[]
    /** Restrict to items captured within [from, to]. Either side may be omitted. */
    dateRange?: { from?: string | null; to?: string | null }
    /** Restrict to a specific source conversation (Claude/ChatGPT/Perplexity thread). */
    sourceConversationId?: string | null
    /** Restrict to specific capture surfaces (e.g. ["mcp", "chatgpt"]). */
    surfaces?: string[]
    /** When true, items with an incoming `supersedes` edge stay in the result. Defaults to false. */
    includeSuperseded?: boolean
    /** Recency half-life in days for the decay multiplier. Defaults to 30. */
    recencyHalfLifeDays?: number
  } & ScopeLifecycleOptions): Promise<SemanticSearchResult[]> {
    const limit = options?.limit ?? 20
    const threshold = options?.threshold ?? 0.5
    const halfLifeDays = options?.recencyHalfLifeDays ?? 30
    const includeSuperseded = options?.includeSuperseded === true
    const scopeColumn = options?.spaceId ? "space_id" : "project_id"
    const scopeId = options?.spaceId ?? projectId
    const lifecycleStates = resolveLifecycleStates(options)

    // Build parameter list with a running counter so optional filters
    // can be mixed and matched cleanly.
    const params: unknown[] = [scopeId, query, JSON.stringify(queryEmbedding), threshold]
    const addParam = (value: unknown) => {
      params.push(value)
      return `$${params.length}`
    }
    const lifecycleClause = `and lifecycle_state = ANY(${addParam(lifecycleStates)}::text[])`

    const typeClause = options?.types?.length ? `and type = ANY(${addParam(options.types)}::text[])` : ""
    const tagClause = options?.tags?.length ? `and tags && ${addParam(options.tags)}::text[]` : ""
    const fromClause = options?.dateRange?.from
      ? `and captured_at >= ${addParam(options.dateRange.from)}::timestamptz`
      : ""
    const toClause = options?.dateRange?.to
      ? `and captured_at <= ${addParam(options.dateRange.to)}::timestamptz`
      : ""
    const convClause = options?.sourceConversationId
      ? `and source_conversation_id = ${addParam(options.sourceConversationId)}`
      : ""
    const surfaceClause = options?.surfaces?.length
      ? `and source_surface = ANY(${addParam(options.surfaces)}::text[])`
      : ""
    const filterSql = [typeClause, tagClause, fromClause, toClause, convClause, surfaceClause]
      .filter(Boolean)
      .join(" ")

    const halfLifeParam = addParam(halfLifeDays)
    const limitParam = addParam(limit)

    // Decay multiplier: 2^(-ageDays / halfLife). `lastReaffirmedAt` refreshes the
    // clock (Mem0-style reaffirmation), so a cited-recent item scores as fresh.
    const decayExpr = `power(2.0, -1.0 * (extract(epoch from (now() - coalesce(m.last_reaffirmed_at, m.captured_at, m.created_at))) / 86400.0) / ${halfLifeParam}::float)`

    const supersededFilter = includeSuperseded
      ? ""
      : `and not exists (
           select 1 from memory_relations r
           where r.target_id = m.id and r.relation_type = 'supersedes'
         )`

    const rows = await this.provider.query(
      `with semantic as (
         select id, 1 - (embedding <=> $3::vector) as score, 'semantic'::text as match_type
         from memory_items
         where ${scopeColumn} = $1
           ${lifecycleClause}
           and embedding is not null
           and 1 - (embedding <=> $3::vector) >= $4
           ${filterSql}
         order by embedding <=> $3::vector
         limit ${limitParam}
       ),
       lexical as (
         select id, ts_rank(search_vector, websearch_to_tsquery('english', $2)) as score, 'lexical'::text as match_type
         from memory_items
         where ${scopeColumn} = $1
           ${lifecycleClause}
           and search_vector @@ websearch_to_tsquery('english', $2)
           ${filterSql}
         order by score desc
         limit ${limitParam}
       ),
       combined as (
         select id, max(score) as score, (array_agg(match_type order by score desc))[1] as match_type
         from (select * from semantic union all select * from lexical) u
         group by id
       )
        select ${prefixCols("m")},
               c.score as raw_score,
               ${decayExpr} as recency_decay,
               ${compactionPenaltyExpr("m")} as compaction_penalty,
               (c.score * ${decayExpr} * ${compactionPenaltyExpr("m")}) as similarity,
               c.match_type
        from combined c
       join memory_items m on m.id = c.id
       where true
         ${supersededFilter}
       order by m.pinned desc, similarity desc
       limit ${limitParam}`,
      params,
    )

    return rows.map((record) => {
      const row = record as Record<string, unknown>
      return {
        ...toMemoryRow(row),
        similarity: Number(row.similarity ?? 0),
        matchType: (row.match_type as "semantic" | "lexical") ?? "semantic",
      }
    })
  }

  /* ─── Relation operations ─── */

  async addRelation(sourceId: string, targetId: string, relationType: MemoryRelationType, confidence?: number): Promise<MemoryRelationRow> {
    const rows = await this.provider.query(
      `insert into memory_relations (source_id, target_id, relation_type, confidence)
       values ($1, $2, $3, $4)
       on conflict (source_id, target_id, relation_type) do update set confidence = $4
       returning ${MEMORY_COLS}`,
      [sourceId, targetId, relationType, confidence ?? 1.0]
    )

    return toMemoryRelationRow(rows[0] as Record<string, unknown>)
  }

  async getRelationsForItem(itemId: string): Promise<MemoryRelationRow[]> {
    const rows = await this.provider.query(
      `select * from memory_relations
       where source_id = $1 or target_id = $1
       order by created_at desc`,
      [itemId]
    )

    return rows.map((record) => toMemoryRelationRow(record as Record<string, unknown>))
  }

  async getRelationsForProject(projectId: string): Promise<MemoryRelationRow[]> {
    const rows = await this.provider.query(
      `select mr.* from memory_relations mr
       join memory_items mi on mi.id = mr.source_id
       where mi.project_id = $1
       order by mr.created_at desc`,
      [projectId]
    )

    return rows.map((record) => toMemoryRelationRow(record as Record<string, unknown>))
  }

  async getSimilarityEdgesForProject(projectId: string, threshold?: number): Promise<Array<{ sourceId: string; targetId: string; similarity: number }>> {
    const minSimilarity = threshold ?? 0.75

    const rows = await this.provider.query(
      `select a.id as source_id, b.id as target_id, 1 - (a.embedding <=> b.embedding) as similarity
       from memory_items a
       join memory_items b on a.project_id = b.project_id and a.id < b.id
       where a.project_id = $1
         and a.is_archived = false
         and b.is_archived = false
         and a.embedding is not null
         and b.embedding is not null
         and 1 - (a.embedding <=> b.embedding) >= $2
       order by similarity desc
       limit 200`,
      [projectId, minSimilarity]
    )

    return rows.map((record) => {
      const row = record as Record<string, unknown>
      return {
        sourceId: String(row.source_id),
        targetId: String(row.target_id),
        similarity: Number(row.similarity)
      }
    })
  }

  async getItemsWithoutEmbeddings(limit?: number): Promise<MemoryItemRow[]> {
    const rows = await this.provider.query(
      `select ${MEMORY_COLS} from memory_items
       where embedding is null
         and is_archived = false
       order by created_at desc
       limit $1`,
      [limit ?? 100]
    )

    return rows.map((record) => toMemoryRow(record as Record<string, unknown>))
  }

  async getItemsWithStaleEmbeddingModel(currentModel: string, limit?: number): Promise<MemoryItemRow[]> {
    const rows = await this.provider.query(
      `select ${MEMORY_COLS} from memory_items
       where embedding is not null
         and is_archived = false
         and (embedding_model is null or embedding_model <> $1)
       order by created_at desc
       limit $2`,
      [currentModel, limit ?? 100]
    )

    return rows.map((record) => toMemoryRow(record as Record<string, unknown>))
  }

  async archiveExpiredItems(projectId: string): Promise<number> {
    const rows = await this.provider.query(
      `update memory_items
       set is_archived = true,
           metadata = metadata || '{"archivedBy": "expiry"}'::jsonb,
           updated_at = now()
       where project_id = $1
         and forget_after is not null
         and forget_after < now()
         and is_archived = false
       returning id`,
      [projectId]
    )
    return rows.length
  }

  async archiveByConversationId(projectId: string, conversationId: string): Promise<number> {
    const rows = await this.provider.query(
      `update memory_items
       set is_archived = true,
           metadata = metadata || '{"archivedBy": "session_detached"}'::jsonb,
           updated_at = now()
       where project_id = $1
         and source_conversation_id = $2
         and is_archived = false
       returning id`,
      [projectId, conversationId]
    )
    return rows.length
  }

  async reaffirm(id: string): Promise<void> {
    await this.provider.query(
      `update memory_items set last_reaffirmed_at = now(), updated_at = now() where id = $1`,
      [id]
    )
  }

  async countActiveByProject(projectId: string): Promise<number> {
    const rows = await this.provider.query(
      `select count(*)::int as count from memory_items where project_id = $1 and is_archived = false`,
      [projectId]
    )
    return Number((rows[0] as Record<string, unknown>)?.count ?? 0)
  }

  async archiveDecayedItems(projectId: string, threshold: number): Promise<number> {
    const rows = await this.provider.query(
      `update memory_items
       set is_archived = true,
           metadata = metadata || '{"archivedBy": "decay"}'::jsonb,
           updated_at = now()
       where project_id = $1
         and is_archived = false
         and pinned = false
         and (
           case when pinned then 1.0
           else pow(0.5,
             extract(epoch from now() - greatest(updated_at, coalesce(last_reaffirmed_at, updated_at))) / 86400.0
             / case type
                 when 'requirement' then 120 when 'decision' then 90 when 'constraint' then 60
                 when 'note' then 30 when 'task' then 21 when 'artifact' then 14 else 30
               end
           ) end
         ) < $2
       returning id`,
      [projectId, threshold]
    )
    return rows.length
  }

  async archiveOverBudget(projectId: string, maxItems: number): Promise<number> {
    const rows = await this.provider.query(
      `with ranked as (
         select id,
           case when pinned then 1.0
           else pow(0.5,
             extract(epoch from now() - greatest(updated_at, coalesce(last_reaffirmed_at, updated_at))) / 86400.0
             / case type
                 when 'requirement' then 120 when 'decision' then 90 when 'constraint' then 60
                 when 'note' then 30 when 'task' then 21 when 'artifact' then 14 else 30
               end
           ) end as decay_score,
           row_number() over (order by pinned desc,
             case when pinned then 1.0
             else pow(0.5,
               extract(epoch from now() - greatest(updated_at, coalesce(last_reaffirmed_at, updated_at))) / 86400.0
               / case type
                   when 'requirement' then 120 when 'decision' then 90 when 'constraint' then 60
                   when 'note' then 30 when 'task' then 21 when 'artifact' then 14 else 30
                 end
             ) end desc
           ) as rn
         from memory_items
         where project_id = $1 and is_archived = false
       )
       update memory_items
       set is_archived = true,
           metadata = metadata || '{"archivedBy": "budget"}'::jsonb,
           updated_at = now()
       where id in (select id from ranked where rn > $2 and pinned = false)
       returning id`,
      [projectId, maxItems]
    )
    return rows.length
  }
}
