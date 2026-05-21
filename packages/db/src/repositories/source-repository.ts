import type { MemoryItemType, ProjectSourceKind, ProjectSourceRow, ProjectSourceStatus, SourceChunkRow, SourceFactCandidateRow, SourceVersionRow } from "@relay/shared"

import { toProjectSourceRow, toSourceChunkRow, toSourceFactCandidateRow, toSourceVersionRow } from "../mappers/source-mapper"
import type { DatabaseProvider } from "../store/provider"
import { decryptTextIfNeeded, encryptTextIfConfigured } from "../utils/encrypted-text"

const SOURCE_COLS = `id, project_id, kind, status, display_name, original_file_name, mime_type, byte_size, storage_object_key, content_hash, source_uri, last_seen_hash, stale_reason, metadata, created_by, created_at, updated_at, archived_at`
const VERSION_COLS = `id, source_id, project_id, status, storage_object_key, content_hash, byte_size, extracted_text_hash, extracted_text_bytes, chunk_count, token_estimate, metadata, error_message, created_by, created_at`
const CHUNK_COLS = `id, source_id, version_id, project_id, chunk_index, content, token_estimate, locator, metadata, embedding_model, created_at`
const CANDIDATE_COLS = `id, project_id, source_id, version_id, chunk_id, memory_item_id, type, title, content, confidence, status, metadata, created_at, updated_at`
const PAGE_COLS = `id, source_id, version_id, project_id, url, canonical_url, title, heading_path, content, content_hash, content_type, etag, last_modified, metadata, created_at, updated_at`
const PAGE_SUMMARY_COLS = `id, source_id, version_id, project_id, url, canonical_url, title, heading_path, content_hash, content_type, etag, last_modified, metadata, created_at, updated_at`
const INDEX_JOB_COLS = `id, source_id, project_id, status, kind, progress, pages_total, pages_indexed, error_message, metadata, created_by, created_at, updated_at, finished_at`
const GLOBAL_SOURCE_COLS = `id, source_type, canonical_url, display_name, trust_score, metadata, created_at, updated_at`

export interface CreateSourceInput {
  projectId: string
  kind: ProjectSourceKind
  displayName: string
  originalFileName?: string | null
  mimeType?: string | null
  byteSize: number
  storageObjectKey?: string | null
  contentHash?: string | null
  sourceUri?: string | null
  metadata?: Record<string, unknown>
}

export interface CreateVersionInput {
  sourceId: string
  projectId: string
  storageObjectKey?: string | null
  contentHash: string
  byteSize: number
  metadata?: Record<string, unknown>
}

export interface CreateChunkInput {
  sourceId: string
  versionId: string
  projectId: string
  chunkIndex: number
  content: string
  tokenEstimate: number
  locator?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface CreateSourcePageInput {
  sourceId: string
  versionId: string
  projectId: string
  url: string
  canonicalUrl?: string | null
  title?: string | null
  headingPath?: string[]
  content: string
  contentHash: string
  contentType?: string | null
  etag?: string | null
  lastModified?: string | null
  metadata?: Record<string, unknown>
}

export interface SourcePageRow {
  id: string
  sourceId: string
  versionId: string
  projectId: string
  url: string
  canonicalUrl: string | null
  title: string | null
  headingPath: string[]
  content: string
  contentHash: string
  contentType: string | null
  etag: string | null
  lastModified: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface SourceIndexJobRow {
  id: string
  sourceId: string
  projectId: string
  status: "queued" | "running" | "ready" | "failed"
  kind: "index" | "refresh" | "import"
  progress: number
  pagesTotal: number
  pagesIndexed: number
  errorMessage: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  finishedAt: string | null
}

export interface GlobalSourceRow {
  id: string
  sourceType: string
  canonicalUrl: string
  displayName: string
  trustScore: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface CreateFactCandidateInput {
  projectId: string
  sourceId: string
  versionId: string
  chunkId?: string | null
  type: MemoryItemType
  title?: string | null
  content: string
  confidence: number
  metadata?: Record<string, unknown>
}

export interface SourceMemoryLinkRow {
  sourceId: string
  versionId: string
  chunkId: string | null
  memoryItemId: string
  confidence: number
}

export interface SourceChunkSearchOptions {
  query: string
  sourceId?: string
  kinds?: ProjectSourceKind[]
  queryEmbedding?: number[]
  limit?: number
}

export interface SourceChunkSearchResult {
  sourceId: string
  sourceKind: ProjectSourceKind
  sourceTitle: string
  sourceUrl: string | null
  chunkId: string
  versionId: string
  content: string
  locator: Record<string, unknown>
  metadata: Record<string, unknown>
  provider: string | null
  score: number
  indexedAt: string | null
}

export interface CreateExternalCitationInput {
  projectId: string
  sourceId: string
  versionId: string
  chunkId?: string | null
  provider: "context7" | "nia" | "external"
  providerSourceId?: string | null
  title: string
  url: string
  contentHash: string
  locator?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function toSourcePageRow(row: Record<string, unknown>): SourcePageRow {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    versionId: String(row.version_id),
    projectId: String(row.project_id),
    url: String(row.url),
    canonicalUrl: row.canonical_url ? String(row.canonical_url) : null,
    title: row.title ? String(row.title) : null,
    headingPath: Array.isArray(row.heading_path) ? row.heading_path.map(String) : [],
    content: decryptTextIfNeeded(String(row.content ?? "")),
    contentHash: String(row.content_hash),
    contentType: row.content_type ? String(row.content_type) : null,
    etag: row.etag ? String(row.etag) : null,
    lastModified: row.last_modified ? String(row.last_modified) : null,
    metadata: jsonRecord(row.metadata),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function toSourceIndexJobRow(row: Record<string, unknown>): SourceIndexJobRow {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    projectId: String(row.project_id),
    status: row.status as SourceIndexJobRow["status"],
    kind: row.kind as SourceIndexJobRow["kind"],
    progress: Number(row.progress ?? 0),
    pagesTotal: Number(row.pages_total ?? 0),
    pagesIndexed: Number(row.pages_indexed ?? 0),
    errorMessage: row.error_message ? String(row.error_message) : null,
    metadata: jsonRecord(row.metadata),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    finishedAt: row.finished_at ? String(row.finished_at) : null,
  }
}

function toGlobalSourceRow(row: Record<string, unknown>): GlobalSourceRow {
  return {
    id: String(row.id),
    sourceType: String(row.source_type),
    canonicalUrl: String(row.canonical_url),
    displayName: String(row.display_name),
    trustScore: Number(row.trust_score ?? 0),
    metadata: jsonRecord(row.metadata),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function toSourceChunkSearchResult(row: Record<string, unknown>): SourceChunkSearchResult {
  const sourceMetadata = jsonRecord(row.source_metadata)
  const external = jsonRecord(sourceMetadata.external)
  return {
    sourceId: String(row.source_id),
    sourceKind: row.source_kind as ProjectSourceKind,
    sourceTitle: String(row.source_title),
    sourceUrl: row.source_url ? String(row.source_url) : null,
    chunkId: String(row.chunk_id),
    versionId: String(row.version_id),
    content: decryptTextIfNeeded(String(row.content)),
    locator: jsonRecord(row.locator),
    metadata: jsonRecord(row.metadata),
    provider: typeof external.provider === "string" ? external.provider : null,
    score: Number(row.score ?? 0),
    indexedAt: row.indexed_at ? String(row.indexed_at) : null,
  }
}

export class SourceRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async create(userId: string, input: CreateSourceInput): Promise<ProjectSourceRow> {
    const rows = await this.provider.query(
      `insert into project_sources (project_id, kind, status, display_name, original_file_name, mime_type, byte_size, storage_object_key, content_hash, source_uri, metadata, created_by)
       values ($1,$2,'processing',$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
       returning ${SOURCE_COLS}`,
      [
        input.projectId,
        input.kind,
        input.displayName,
        input.originalFileName ?? null,
        input.mimeType ?? null,
        input.byteSize,
        input.storageObjectKey ?? null,
        input.contentHash ?? null,
        input.sourceUri ?? null,
        JSON.stringify(input.metadata ?? {}),
        userId,
      ],
    )
    return toProjectSourceRow(rows[0] as Record<string, unknown>)
  }

  async createVersion(userId: string, input: CreateVersionInput): Promise<SourceVersionRow> {
    const rows = await this.provider.query(
      `insert into source_versions (source_id, project_id, status, storage_object_key, content_hash, byte_size, metadata, created_by)
       values ($1,$2,'processing',$3,$4,$5,$6::jsonb,$7)
       returning ${VERSION_COLS}`,
      [
        input.sourceId,
        input.projectId,
        input.storageObjectKey ?? null,
        input.contentHash,
        input.byteSize,
        JSON.stringify(input.metadata ?? {}),
        userId,
      ],
    )
    return toSourceVersionRow(rows[0] as Record<string, unknown>)
  }

  async listByProject(projectId: string, options: { includeArchived?: boolean } = {}): Promise<ProjectSourceRow[]> {
    const rows = await this.provider.query(
      `select ${SOURCE_COLS}
       from project_sources
       where project_id = $1
         and ($2::boolean or status <> 'archived')
       order by updated_at desc`,
      [projectId, options.includeArchived ?? false],
    )
    return rows.map((row) => toProjectSourceRow(row as Record<string, unknown>))
  }

  async getById(id: string): Promise<ProjectSourceRow | null> {
    const rows = await this.provider.query(
      `select ${SOURCE_COLS} from project_sources where id = $1 limit 1`,
      [id],
    )
    return rows[0] ? toProjectSourceRow(rows[0] as Record<string, unknown>) : null
  }

  async findBySourceUri(projectId: string, sourceUri: string): Promise<ProjectSourceRow | null> {
    const rows = await this.provider.query(
      `select ${SOURCE_COLS}
       from project_sources
       where project_id = $1
         and source_uri = $2
         and status <> 'archived'
       order by updated_at desc
       limit 1`,
      [projectId, sourceUri],
    )
    return rows[0] ? toProjectSourceRow(rows[0] as Record<string, unknown>) : null
  }

  async getLatestVersion(sourceId: string): Promise<SourceVersionRow | null> {
    const rows = await this.provider.query(
      `select ${VERSION_COLS}
       from source_versions
       where source_id = $1
       order by created_at desc
       limit 1`,
      [sourceId],
    )
    return rows[0] ? toSourceVersionRow(rows[0] as Record<string, unknown>) : null
  }

  async updateSourceStatus(sourceId: string, status: ProjectSourceStatus, patch: { staleReason?: string | null; metadata?: Record<string, unknown>; contentHash?: string | null; byteSize?: number } = {}): Promise<ProjectSourceRow> {
    const rows = await this.provider.query(
      `update project_sources
       set status = $2,
           stale_reason = case when $3::boolean then $4 else stale_reason end,
           metadata = coalesce($5::jsonb, metadata),
           content_hash = case when $6::boolean then $7 else content_hash end,
           byte_size = case when $8::boolean then $9 else byte_size end,
           archived_at = case when $2 = 'archived' then coalesce(archived_at, now()) else archived_at end,
           updated_at = now()
       where id = $1
       returning ${SOURCE_COLS}`,
      [
        sourceId,
        status,
        Object.prototype.hasOwnProperty.call(patch, "staleReason"),
        patch.staleReason ?? null,
        patch.metadata ? JSON.stringify(patch.metadata) : null,
        Object.prototype.hasOwnProperty.call(patch, "contentHash"),
        patch.contentHash ?? null,
        Object.prototype.hasOwnProperty.call(patch, "byteSize"),
        patch.byteSize ?? null,
      ],
    )
    return toProjectSourceRow(rows[0] as Record<string, unknown>)
  }

  async updateSourceObjectKey(sourceId: string, storageObjectKey: string): Promise<void> {
    await this.provider.query(
      `update project_sources
       set storage_object_key = $2,
           updated_at = now()
       where id = $1`,
      [sourceId, storageObjectKey],
    )
  }

  // Permanently removes the source. source_versions, source_chunks,
  // source_fact_candidates and source_memory_links all FK
  // project_sources(id) ON DELETE CASCADE (migration 0037), so one delete
  // tears down the whole tree.
  async hardDelete(sourceId: string): Promise<void> {
    await this.provider.query(
      `delete from project_sources where id = $1`,
      [sourceId],
    )
  }

  // Drop chunks + pending candidates for a version so a reprocess can re-chunk
  // without colliding on unique(version_id, chunk_index). Promoted candidates
  // (already memory items) are left intact.
  async clearVersionArtifacts(versionId: string): Promise<void> {
    await this.provider.query(`delete from source_chunks where version_id = $1`, [versionId])
    await this.provider.query(
      `delete from source_fact_candidates where version_id = $1 and status = 'pending'`,
      [versionId],
    )
  }

  async markVersionReady(versionId: string, input: { extractedTextHash: string; extractedTextBytes: number; chunkCount: number; tokenEstimate: number; metadata?: Record<string, unknown> }): Promise<SourceVersionRow> {
    const rows = await this.provider.query(
      `update source_versions
       set status = 'ready',
           extracted_text_hash = $2,
           extracted_text_bytes = $3,
           chunk_count = $4,
           token_estimate = $5,
           metadata = coalesce($6::jsonb, metadata)
       where id = $1
       returning ${VERSION_COLS}`,
      [versionId, input.extractedTextHash, input.extractedTextBytes, input.chunkCount, input.tokenEstimate, input.metadata ? JSON.stringify(input.metadata) : null],
    )
    return toSourceVersionRow(rows[0] as Record<string, unknown>)
  }

  async markVersionFailed(versionId: string, message: string): Promise<SourceVersionRow> {
    const rows = await this.provider.query(
      `update source_versions
       set status = 'failed',
           error_message = $2
       where id = $1
       returning ${VERSION_COLS}`,
      [versionId, message],
    )
    return toSourceVersionRow(rows[0] as Record<string, unknown>)
  }

  async createChunks(chunks: CreateChunkInput[]): Promise<SourceChunkRow[]> {
    if (chunks.length === 0) return []
    const placeholders: string[] = []
    const params: unknown[] = []
    let i = 1
    for (const chunk of chunks) {
      placeholders.push(`($${i},$${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5},$${i + 6}::jsonb,$${i + 7}::jsonb,to_tsvector('english', $${i + 8}))`)
      params.push(
        chunk.sourceId,
        chunk.versionId,
        chunk.projectId,
        chunk.chunkIndex,
        encryptTextIfConfigured(chunk.content),
        chunk.tokenEstimate,
        JSON.stringify(chunk.locator ?? {}),
        JSON.stringify(chunk.metadata ?? {}),
        chunk.content,
      )
      i += 9
    }
    const rows = await this.provider.query(
      `insert into source_chunks (source_id, version_id, project_id, chunk_index, content, token_estimate, locator, metadata, search_vector)
       values ${placeholders.join(", ")}
       returning ${CHUNK_COLS}`,
      params,
    )
    return rows.map((row) => toSourceChunkRow(row as Record<string, unknown>))
  }

  async createIndexJob(userId: string, input: {
    sourceId: string
    projectId: string
    kind: SourceIndexJobRow["kind"]
    pagesTotal?: number
    pagesIndexed?: number
    progress?: number
    metadata?: Record<string, unknown>
  }): Promise<SourceIndexJobRow> {
    const rows = await this.provider.query(
      `insert into source_index_jobs (source_id, project_id, kind, status, progress, pages_total, pages_indexed, metadata, created_by)
       values ($1,$2,$3,'queued',$4,$5,$6,$7::jsonb,$8)
       returning ${INDEX_JOB_COLS}`,
      [
        input.sourceId,
        input.projectId,
        input.kind,
        input.progress ?? 0,
        input.pagesTotal ?? 0,
        input.pagesIndexed ?? 0,
        JSON.stringify(input.metadata ?? {}),
        userId,
      ],
    )
    return toSourceIndexJobRow(rows[0] as Record<string, unknown>)
  }

  async updateIndexJob(jobId: string, patch: {
    status?: SourceIndexJobRow["status"]
    progress?: number
    pagesTotal?: number
    pagesIndexed?: number
    errorMessage?: string | null
    metadata?: Record<string, unknown>
  }): Promise<SourceIndexJobRow> {
    const rows = await this.provider.query(
      `update source_index_jobs
       set status = coalesce($2, status),
           progress = coalesce($3, progress),
           pages_total = coalesce($4, pages_total),
           pages_indexed = coalesce($5, pages_indexed),
           error_message = case when $6::boolean then $7 else error_message end,
           metadata = coalesce($8::jsonb, metadata),
           finished_at = case when coalesce($2, status) in ('ready', 'failed') then coalesce(finished_at, now()) else finished_at end,
           updated_at = now()
       where id = $1
       returning ${INDEX_JOB_COLS}`,
      [
        jobId,
        patch.status ?? null,
        patch.progress ?? null,
        patch.pagesTotal ?? null,
        patch.pagesIndexed ?? null,
        Object.prototype.hasOwnProperty.call(patch, "errorMessage"),
        patch.errorMessage ?? null,
        patch.metadata ? JSON.stringify(patch.metadata) : null,
      ],
    )
    return toSourceIndexJobRow(rows[0] as Record<string, unknown>)
  }

  async upsertSourcePages(pages: CreateSourcePageInput[]): Promise<SourcePageRow[]> {
    if (pages.length === 0) return []
    const placeholders: string[] = []
    const params: unknown[] = []
    let i = 1
    for (const page of pages) {
      placeholders.push(`($${i},$${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5},$${i + 6}::text[],$${i + 7},$${i + 8},$${i + 9},$${i + 10},$${i + 11},$${i + 12}::jsonb,to_tsvector('english', $${i + 13}))`)
      params.push(
        page.sourceId,
        page.versionId,
        page.projectId,
        page.url,
        page.canonicalUrl ?? page.url,
        page.title ?? null,
        page.headingPath ?? [],
        encryptTextIfConfigured(page.content),
        page.contentHash,
        page.contentType ?? "text/plain",
        page.etag ?? null,
        page.lastModified ?? null,
        JSON.stringify(page.metadata ?? {}),
        page.content,
      )
      i += 14
    }
    const rows = await this.provider.query(
      `insert into source_pages (source_id, version_id, project_id, url, canonical_url, title, heading_path, content, content_hash, content_type, etag, last_modified, metadata, search_vector)
       values ${placeholders.join(", ")}
       on conflict (source_id, url) do update set
         version_id = excluded.version_id,
         canonical_url = excluded.canonical_url,
         title = excluded.title,
         heading_path = excluded.heading_path,
         content = excluded.content,
         content_hash = excluded.content_hash,
         content_type = excluded.content_type,
         etag = excluded.etag,
         last_modified = excluded.last_modified,
         metadata = excluded.metadata,
         search_vector = excluded.search_vector,
         updated_at = now()
       returning ${PAGE_COLS}`,
      params,
    )
    return rows.map((row) => toSourcePageRow(row as Record<string, unknown>))
  }

  async listSourcePages(projectId: string, options: { sourceId?: string; limit?: number } = {}): Promise<SourcePageRow[]> {
    const params: unknown[] = [projectId]
    const filters = ["project_id = $1"]
    if (options.sourceId) {
      params.push(options.sourceId)
      filters.push(`source_id = $${params.length}`)
    }
    params.push(options.limit ?? 100)
    const rows = await this.provider.query(
      `select ${PAGE_SUMMARY_COLS}
       from source_pages
       where ${filters.join(" and ")}
       order by title nulls last, url asc
       limit $${params.length}`,
      params,
    )
    return rows.map((row) => toSourcePageRow(row as Record<string, unknown>))
  }

  async upsertGlobalSource(input: {
    sourceType: string
    canonicalUrl: string
    displayName: string
    trustScore?: number
    metadata?: Record<string, unknown>
  }): Promise<GlobalSourceRow> {
    const rows = await this.provider.query(
      `insert into global_sources (source_type, canonical_url, display_name, trust_score, metadata)
       values ($1,$2,$3,$4,$5::jsonb)
       on conflict (source_type, canonical_url) do update set
         display_name = excluded.display_name,
         trust_score = greatest(global_sources.trust_score, excluded.trust_score),
         metadata = global_sources.metadata || excluded.metadata,
         updated_at = now()
       returning ${GLOBAL_SOURCE_COLS}`,
      [
        input.sourceType,
        input.canonicalUrl,
        input.displayName,
        input.trustScore ?? 0,
        JSON.stringify(input.metadata ?? {}),
      ],
    )
    return toGlobalSourceRow(rows[0] as Record<string, unknown>)
  }

  async linkGlobalSourceToProject(input: {
    projectId: string
    globalSourceId: string
    projectSourceId?: string | null
    metadata?: Record<string, unknown>
  }): Promise<void> {
    await this.provider.query(
      `insert into project_global_source_links (project_id, global_source_id, project_source_id, metadata)
       values ($1,$2,$3,$4::jsonb)
       on conflict (project_id, global_source_id) do update set
         project_source_id = excluded.project_source_id,
         metadata = project_global_source_links.metadata || excluded.metadata`,
      [
        input.projectId,
        input.globalSourceId,
        input.projectSourceId ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    )
  }

  async searchGlobalSources(query: string, limit = 8): Promise<GlobalSourceRow[]> {
    const rows = await this.provider.query(
      `select ${GLOBAL_SOURCE_COLS}
       from global_sources
       where lower(display_name) like '%' || lower($1) || '%'
          or lower(canonical_url) like '%' || lower($1) || '%'
       order by trust_score desc, updated_at desc
       limit $2`,
      [query, limit],
    )
    return rows.map((row) => toGlobalSourceRow(row as Record<string, unknown>))
  }

  async listChunks(sourceId: string, options: { limit?: number } = {}): Promise<SourceChunkRow[]> {
    const rows = await this.provider.query(
      `select ${CHUNK_COLS}
       from source_chunks
       where source_id = $1
       order by chunk_index asc
       limit $2`,
      [sourceId, options.limit ?? 100],
    )
    return rows.map((row) => toSourceChunkRow(row as Record<string, unknown>))
  }

  async getChunkById(chunkId: string): Promise<SourceChunkRow | null> {
    const rows = await this.provider.query(
      `select ${CHUNK_COLS}
       from source_chunks
       where id = $1
       limit 1`,
      [chunkId],
    )
    return rows[0] ? toSourceChunkRow(rows[0] as Record<string, unknown>) : null
  }

  async searchChunks(projectId: string, options: SourceChunkSearchOptions): Promise<SourceChunkSearchResult[]> {
    const params: unknown[] = [projectId, options.query]
    const filters = [
      "project_id = $1",
      "source_status = 'ready'",
    ]
    if (options.sourceId) {
      params.push(options.sourceId)
      filters.push(`source_id = $${params.length}`)
    }
    if (options.kinds?.length) {
      params.push(options.kinds)
      filters.push(`source_kind = ANY($${params.length}::text[])`)
    }
    let vectorExpr = "0::double precision"
    let matchFilter = "lexical_score > 0"
    if (options.queryEmbedding?.length) {
      params.push(JSON.stringify(options.queryEmbedding))
      const embeddingParam = params.length
      vectorExpr = `case when c.embedding is not null then 1 - (c.embedding <=> $${embeddingParam}::vector) else 0 end`
      matchFilter = "(lexical_score > 0 or vector_score >= 0.45)"
    }

    params.push(options.limit ?? 10)
    const limitParam = params.length
    const rows = await this.provider.query(
      `with base as (
         select
           s.id as source_id,
           s.project_id,
           s.kind as source_kind,
           s.status as source_status,
           s.display_name as source_title,
           s.source_uri as source_url,
           s.metadata as source_metadata,
           c.id as chunk_id,
           c.version_id,
           c.content,
           c.locator,
           c.metadata,
           c.chunk_index,
           ts_rank_cd(c.search_vector, websearch_to_tsquery('english', $2)) as lexical_score,
           ${vectorExpr} as vector_score,
           v.created_at as indexed_at
         from source_chunks c
         join project_sources s on s.id = c.source_id
         left join source_versions v on v.id = c.version_id
       ),
       ranked as (
         select *,
           case
             when lower(source_title) = lower($2) then 0.2
             when lower(source_title) like '%' || lower($2) || '%' then 0.1
             else 0
           end as title_boost
         from base
         where ${filters.join("\n           and ")}
       )
       select
         source_id,
         source_kind,
         source_title,
         source_url,
         source_metadata,
         chunk_id,
         version_id,
         content,
         locator,
         metadata,
         chunk_index,
         lexical_score,
         indexed_at,
         vector_score,
         title_boost,
         greatest(lexical_score, vector_score) + title_boost as score
       from ranked
       where ${matchFilter}
       order by score desc, chunk_index asc
       limit $${limitParam}`,
      params,
    )
    return rows.map((row) => toSourceChunkSearchResult(row as Record<string, unknown>))
  }

  async grepChunks(projectId: string, options: { query: string; sourceId?: string; limit?: number }): Promise<SourceChunkSearchResult[]> {
    const params: unknown[] = [projectId, options.query]
    const filters = [
      "s.project_id = $1",
      "s.status = 'ready'",
      "position(lower($2) in lower(c.content)) > 0",
    ]
    if (options.sourceId) {
      params.push(options.sourceId)
      filters.push(`s.id = $${params.length}`)
    }
    params.push(options.limit ?? 20)
    const limitParam = params.length
    const rows = await this.provider.query(
      `select
         s.id as source_id,
         s.kind as source_kind,
         s.display_name as source_title,
         s.source_uri as source_url,
         s.metadata as source_metadata,
         c.id as chunk_id,
         c.version_id,
         c.content,
         c.locator,
         c.metadata,
         (
           1.0 / greatest(position(lower($2) in lower(c.content)), 1)
           + case when lower(s.display_name) like '%' || lower($2) || '%' then 0.2 else 0 end
         ) as score,
         v.created_at as indexed_at
       from source_chunks c
       join project_sources s on s.id = c.source_id
       left join source_versions v on v.id = c.version_id
       where ${filters.join("\n         and ")}
       order by score desc, c.chunk_index asc
       limit $${limitParam}`,
      params,
    )
    return rows.map((row) => toSourceChunkSearchResult(row as Record<string, unknown>))
  }

  async createExternalCitations(citations: CreateExternalCitationInput[]): Promise<void> {
    if (citations.length === 0) return
    const placeholders: string[] = []
    const params: unknown[] = []
    let i = 1
    for (const citation of citations) {
      placeholders.push(`($${i},$${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5},$${i + 6},$${i + 7},$${i + 8},$${i + 9}::jsonb,$${i + 10}::jsonb)`)
      params.push(
        citation.projectId,
        citation.sourceId,
        citation.versionId,
        citation.chunkId ?? null,
        citation.provider,
        citation.providerSourceId ?? null,
        citation.title,
        citation.url,
        citation.contentHash,
        JSON.stringify(citation.locator ?? {}),
        JSON.stringify(citation.metadata ?? {}),
      )
      i += 11
    }
    await this.provider.query(
      `insert into source_external_citations (project_id, source_id, version_id, chunk_id, provider, provider_source_id, title, url, content_hash, locator, metadata)
       values ${placeholders.join(", ")}`,
      params,
    )
  }

  async createFactCandidates(candidates: CreateFactCandidateInput[]): Promise<SourceFactCandidateRow[]> {
    if (candidates.length === 0) return []
    const placeholders: string[] = []
    const params: unknown[] = []
    let i = 1
    for (const candidate of candidates) {
      placeholders.push(`($${i},$${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5},$${i + 6},$${i + 7},$${i + 8}::jsonb)`)
      params.push(
        candidate.projectId,
        candidate.sourceId,
        candidate.versionId,
        candidate.chunkId ?? null,
        candidate.type,
        candidate.title ?? null,
        encryptTextIfConfigured(candidate.content),
        candidate.confidence,
        JSON.stringify(candidate.metadata ?? {}),
      )
      i += 9
    }
    const rows = await this.provider.query(
      `insert into source_fact_candidates (project_id, source_id, version_id, chunk_id, type, title, content, confidence, metadata)
       values ${placeholders.join(", ")}
       returning ${CANDIDATE_COLS}`,
      params,
    )
    return rows.map((row) => toSourceFactCandidateRow(row as Record<string, unknown>))
  }

  async listFactCandidates(sourceId: string): Promise<SourceFactCandidateRow[]> {
    const rows = await this.provider.query(
      `select ${CANDIDATE_COLS}
       from source_fact_candidates
       where source_id = $1
       order by confidence desc, created_at asc`,
      [sourceId],
    )
    return rows.map((row) => toSourceFactCandidateRow(row as Record<string, unknown>))
  }

  async listPendingFactCandidates(sourceId: string): Promise<SourceFactCandidateRow[]> {
    const rows = await this.provider.query(
      `select ${CANDIDATE_COLS}
       from source_fact_candidates
       where source_id = $1 and status = 'pending'
       order by confidence desc, created_at asc`,
      [sourceId],
    )
    return rows.map((row) => toSourceFactCandidateRow(row as Record<string, unknown>))
  }

  async markFactCandidatePromoted(candidateId: string, memoryItemId: string): Promise<void> {
    await this.provider.query(
      `update source_fact_candidates
       set status = 'promoted',
           memory_item_id = $2,
           updated_at = now()
       where id = $1`,
      [candidateId, memoryItemId],
    )
  }

  async rejectFactCandidate(candidateId: string): Promise<void> {
    await this.provider.query(
      `update source_fact_candidates
       set status = 'rejected',
           updated_at = now()
       where id = $1`,
      [candidateId],
    )
  }

  async linkMemory(input: { sourceId: string; versionId: string; chunkId?: string | null; memoryItemId: string; confidence?: number }): Promise<void> {
    await this.provider.query(
      `insert into source_memory_links (source_id, version_id, chunk_id, memory_item_id, confidence)
       values ($1,$2,$3,$4,$5)
       on conflict (source_id, memory_item_id) do update set
         chunk_id = excluded.chunk_id,
         confidence = excluded.confidence`,
      [input.sourceId, input.versionId, input.chunkId ?? null, input.memoryItemId, input.confidence ?? 1],
    )
  }

  async listMemoryLinksByProject(projectId: string): Promise<SourceMemoryLinkRow[]> {
    const rows = await this.provider.query(
      `select l.source_id, l.version_id, l.chunk_id, l.memory_item_id, l.confidence
       from source_memory_links l
       join project_sources s on s.id = l.source_id
       where s.project_id = $1
         and s.status <> 'archived'
       order by l.created_at asc`,
      [projectId],
    )
    return rows.map((row) => ({
      sourceId: String((row as Record<string, unknown>).source_id),
      versionId: String((row as Record<string, unknown>).version_id),
      chunkId: (row as Record<string, unknown>).chunk_id ? String((row as Record<string, unknown>).chunk_id) : null,
      memoryItemId: String((row as Record<string, unknown>).memory_item_id),
      confidence: Number((row as Record<string, unknown>).confidence ?? 1),
    }))
  }

  async countMemoryLinksBySourceIds(sourceIds: string[]): Promise<Map<string, number>> {
    if (sourceIds.length === 0) return new Map()
    const rows = await this.provider.query<{ source_id: string; count: number }>(
      `select source_id, count(*)::int as count
       from source_memory_links
       where source_id = ANY($1::uuid[])
       group by source_id`,
      [sourceIds],
    )
    const map = new Map<string, number>()
    for (const row of rows) {
      map.set(String((row as Record<string, unknown>).source_id), Number((row as Record<string, unknown>).count ?? 0))
    }
    return map
  }

  async markLinkedMemoriesPotentiallyStale(sourceId: string, input: {
    sourceVersionId: string
    previousContentHash: string | null
    contentHash: string
    changedAt: string
  }): Promise<void> {
    await this.provider.query(
      `update memory_items m
       set metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object(
             'potentially_stale', true,
             'staleReason', 'source_content_changed',
             'staleSourceId', $1::text,
             'staleSourceVersionId', $2::text,
             'previousSourceContentHash', $3::text,
             'sourceContentHash', $4::text,
             'sourceChangedAt', $5::text
           ),
           updated_at = now()
       from source_memory_links l
       where l.memory_item_id = m.id
         and l.source_id = $1`,
      [sourceId, input.sourceVersionId, input.previousContentHash, input.contentHash, input.changedAt],
    )
  }

  async countByProject(projectId: string): Promise<number> {
    const rows = await this.provider.query<{ count: number }>(
      `select count(*)::int as count from project_sources where project_id = $1 and status <> 'archived'`,
      [projectId],
    )
    return Number(rows[0]?.count ?? 0)
  }

  async countExternalByProject(projectId: string): Promise<number> {
    const rows = await this.provider.query<{ count: number }>(
      `select count(*)::int as count
       from project_sources
       where project_id = $1
         and kind in ('external_docs', 'package_docs')
         and status <> 'archived'`,
      [projectId],
    )
    return Number(rows[0]?.count ?? 0)
  }

  async sumStorageBytesByUser(userId: string): Promise<number> {
    const rows = await this.provider.query<{ bytes: string | number }>(
      `select coalesce(sum(byte_size), 0) as bytes
       from project_sources
       where created_by = $1 and status <> 'archived'`,
      [userId],
    )
    return Number(rows[0]?.bytes ?? 0)
  }

  async getLatestVersionsBySourceIds(sourceIds: string[]): Promise<Map<string, SourceVersionRow>> {
    if (sourceIds.length === 0) return new Map()
    const rows = await this.provider.query(
      `select distinct on (source_id) ${VERSION_COLS}
       from source_versions
       where source_id = ANY($1::uuid[])
       order by source_id, created_at desc`,
      [sourceIds],
    )
    const map = new Map<string, SourceVersionRow>()
    for (const row of rows) {
      const mapped = toSourceVersionRow(row as Record<string, unknown>)
      map.set(mapped.sourceId, mapped)
    }
    return map
  }

  async countFactCandidatesBySourceIds(sourceIds: string[]): Promise<Map<string, { pending: number; promoted: number }>> {
    if (sourceIds.length === 0) return new Map()
    const rows = await this.provider.query<{ source_id: string; status: string; count: number }>(
      `select source_id, status, count(*)::int as count
       from source_fact_candidates
       where source_id = ANY($1::uuid[])
       group by source_id, status`,
      [sourceIds],
    )
    const map = new Map<string, { pending: number; promoted: number }>()
    for (const row of rows) {
      const r = row as Record<string, unknown>
      const sid = String(r.source_id)
      const status = String(r.status)
      const count = Number(r.count)
      const entry = map.get(sid) ?? { pending: 0, promoted: 0 }
      if (status === "pending") entry.pending = count
      if (status === "promoted") entry.promoted = count
      map.set(sid, entry)
    }
    return map
  }

  async getFirstChunksBySourceIds(sourceIds: string[]): Promise<Map<string, SourceChunkRow>> {
    if (sourceIds.length === 0) return new Map()
    const rows = await this.provider.query(
      `select distinct on (source_id) ${CHUNK_COLS}
       from source_chunks
       where source_id = ANY($1::uuid[])
       order by source_id, chunk_index asc`,
      [sourceIds],
    )
    const map = new Map<string, SourceChunkRow>()
    for (const row of rows) {
      const mapped = toSourceChunkRow(row as Record<string, unknown>)
      map.set(mapped.sourceId, mapped)
    }
    return map
  }
}
