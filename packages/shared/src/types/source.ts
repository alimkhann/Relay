import type { MemoryItemType } from "./database"

export type ProjectSourceKind = "uploaded_file" | "repo_file" | "external_docs" | "package_docs"
export type ProjectSourceStatus = "pending_upload" | "processing" | "ready" | "failed" | "archived" | "stale"
export type SourceVersionStatus = "pending_upload" | "processing" | "ready" | "failed"
export type SourceFactCandidateStatus = "pending" | "promoted" | "rejected"

export interface ProjectSourceRow {
  id: string
  projectId: string
  kind: ProjectSourceKind
  status: ProjectSourceStatus
  displayName: string
  originalFileName: string | null
  mimeType: string | null
  byteSize: number
  storageObjectKey: string | null
  contentHash: string | null
  sourceUri: string | null
  lastSeenHash: string | null
  staleReason: string | null
  metadata: Record<string, unknown>
  createdBy: string
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface SourceVersionRow {
  id: string
  sourceId: string
  projectId: string
  status: SourceVersionStatus
  storageObjectKey: string | null
  contentHash: string
  byteSize: number
  extractedTextHash: string | null
  extractedTextBytes: number
  chunkCount: number
  tokenEstimate: number
  metadata: Record<string, unknown>
  errorMessage: string | null
  createdBy: string
  createdAt: string
}

export interface SourceChunkRow {
  id: string
  sourceId: string
  versionId: string
  projectId: string
  chunkIndex: number
  content: string
  tokenEstimate: number
  locator: Record<string, unknown>
  metadata: Record<string, unknown>
  embedding: number[] | null
  embeddingModel: string | null
  createdAt: string
}

export interface SourceFactCandidateRow {
  id: string
  projectId: string
  sourceId: string
  versionId: string
  chunkId: string | null
  memoryItemId: string | null
  type: MemoryItemType
  title: string | null
  content: string
  confidence: number
  status: SourceFactCandidateStatus
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ProjectSourceDto {
  id: string
  kind: ProjectSourceKind
  status: ProjectSourceStatus
  displayName: string
  originalFileName: string | null
  mimeType: string | null
  byteSize: number
  contentHash: string | null
  sourceUri: string | null
  staleReason: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  latestVersion?: SourceVersionRow | null
  pendingCandidates?: number
  promotedCandidates?: number
}
