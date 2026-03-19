import type { MemoryItemType, SourceSurface } from "./database"

export interface CreateMemoryItemInput {
  projectId: string
  sourceTurnId?: string | null
  type: MemoryItemType
  title?: string | null
  content: string
  pinned?: boolean
  tags?: string[]
  metadata?: Record<string, unknown>
  /** Origin surface where this memory was captured */
  sourceSurface?: SourceSurface | null
  /** Normalized conversation ID for linking back to source */
  sourceConversationId?: string | null
  /** Full URL to source conversation */
  sourceUrl?: string | null
  /** Actual capture timestamp (defaults to now if not provided) */
  capturedAt?: string | null
  /** Array of memory item IDs this item was derived/merged from */
  derivedFrom?: string[] | null
}

export interface UpdateMemoryItemInput {
  title?: string | null
  content?: string
  type?: MemoryItemType
  pinned?: boolean
  tags?: string[]
  isArchived?: boolean
  metadata?: Record<string, unknown>
  sourceConversationId?: string | null
  sourceUrl?: string | null
  capturedAt?: string | null
  derivedFrom?: string[] | null
}
