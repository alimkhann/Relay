import type { MemoryItemType, ProjectSourceKind, ProjectSourceRow, ProjectSourceStatus, SourceChunkRow, SourceFactCandidateRow, SourceVersionRow } from "@relay/shared"

import { toProjectSourceRow, toSourceChunkRow, toSourceFactCandidateRow, toSourceVersionRow } from "../mappers/source-mapper"
import type { DatabaseProvider } from "../store/provider"
import { encryptTextIfConfigured } from "../utils/encrypted-text"

const SOURCE_COLS = `id, project_id, kind, status, display_name, original_file_name, mime_type, byte_size, storage_object_key, content_hash, source_uri, last_seen_hash, stale_reason, metadata, created_by, created_at, updated_at, archived_at`
const VERSION_COLS = `id, source_id, project_id, status, storage_object_key, content_hash, byte_size, extracted_text_hash, extracted_text_bytes, chunk_count, token_estimate, metadata, error_message, created_by, created_at`
const CHUNK_COLS = `id, source_id, version_id, project_id, chunk_index, content, token_estimate, locator, metadata, embedding, embedding_model, created_at`
const CANDIDATE_COLS = `id, project_id, source_id, version_id, chunk_id, memory_item_id, type, title, content, confidence, status, metadata, created_at, updated_at`

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

  async updateSourceStatus(sourceId: string, status: ProjectSourceStatus, patch: { staleReason?: string | null; metadata?: Record<string, unknown> } = {}): Promise<ProjectSourceRow> {
    const rows = await this.provider.query(
      `update project_sources
       set status = $2,
           stale_reason = case when $3::boolean then $4 else stale_reason end,
           metadata = coalesce($5::jsonb, metadata),
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

  async countByProject(projectId: string): Promise<number> {
    const rows = await this.provider.query<{ count: number }>(
      `select count(*)::int as count from project_sources where project_id = $1 and status <> 'archived'`,
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
}
