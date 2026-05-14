import type { ProjectSourceRow, SourceChunkRow, SourceFactCandidateRow, SourceVersionRow } from "@relay/shared"

import { decryptTextIfNeeded } from "../utils/encrypted-text"
import { toTimestamp } from "./timestamp"

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function toProjectSourceRow(record: Record<string, unknown>): ProjectSourceRow {
  return {
    id: String(record.id),
    projectId: String(record.project_id),
    kind: record.kind as ProjectSourceRow["kind"],
    status: record.status as ProjectSourceRow["status"],
    displayName: String(record.display_name),
    originalFileName: record.original_file_name ? String(record.original_file_name) : null,
    mimeType: record.mime_type ? String(record.mime_type) : null,
    byteSize: Number(record.byte_size ?? 0),
    storageObjectKey: record.storage_object_key ? String(record.storage_object_key) : null,
    contentHash: record.content_hash ? String(record.content_hash) : null,
    sourceUri: record.source_uri ? String(record.source_uri) : null,
    lastSeenHash: record.last_seen_hash ? String(record.last_seen_hash) : null,
    staleReason: record.stale_reason ? String(record.stale_reason) : null,
    metadata: jsonRecord(record.metadata),
    createdBy: String(record.created_by),
    createdAt: toTimestamp(record.created_at),
    updatedAt: toTimestamp(record.updated_at),
    archivedAt: record.archived_at ? toTimestamp(record.archived_at) : null,
  }
}

export function toSourceVersionRow(record: Record<string, unknown>): SourceVersionRow {
  return {
    id: String(record.id),
    sourceId: String(record.source_id),
    projectId: String(record.project_id),
    status: record.status as SourceVersionRow["status"],
    storageObjectKey: record.storage_object_key ? String(record.storage_object_key) : null,
    contentHash: String(record.content_hash),
    byteSize: Number(record.byte_size ?? 0),
    extractedTextHash: record.extracted_text_hash ? String(record.extracted_text_hash) : null,
    extractedTextBytes: Number(record.extracted_text_bytes ?? 0),
    chunkCount: Number(record.chunk_count ?? 0),
    tokenEstimate: Number(record.token_estimate ?? 0),
    metadata: jsonRecord(record.metadata),
    errorMessage: record.error_message ? String(record.error_message) : null,
    createdBy: String(record.created_by),
    createdAt: toTimestamp(record.created_at),
  }
}

export function toSourceChunkRow(record: Record<string, unknown>): SourceChunkRow {
  return {
    id: String(record.id),
    sourceId: String(record.source_id),
    versionId: String(record.version_id),
    projectId: String(record.project_id),
    chunkIndex: Number(record.chunk_index ?? 0),
    content: decryptTextIfNeeded(String(record.content)),
    tokenEstimate: Number(record.token_estimate ?? 0),
    locator: jsonRecord(record.locator),
    metadata: jsonRecord(record.metadata),
    embedding: record.embedding ? (record.embedding as number[]) : null,
    embeddingModel: record.embedding_model ? String(record.embedding_model) : null,
    createdAt: toTimestamp(record.created_at),
  }
}

export function toSourceFactCandidateRow(record: Record<string, unknown>): SourceFactCandidateRow {
  return {
    id: String(record.id),
    projectId: String(record.project_id),
    sourceId: String(record.source_id),
    versionId: String(record.version_id),
    chunkId: record.chunk_id ? String(record.chunk_id) : null,
    memoryItemId: record.memory_item_id ? String(record.memory_item_id) : null,
    type: record.type as SourceFactCandidateRow["type"],
    title: record.title ? String(record.title) : null,
    content: decryptTextIfNeeded(String(record.content)),
    confidence: Number(record.confidence ?? 0),
    status: record.status as SourceFactCandidateRow["status"],
    metadata: jsonRecord(record.metadata),
    createdAt: toTimestamp(record.created_at),
    updatedAt: toTimestamp(record.updated_at),
  }
}
