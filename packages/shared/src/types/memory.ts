import type { MemoryItemType } from "./database"

export interface CreateMemoryItemInput {
  projectId: string
  sourceTurnId?: string | null
  type: MemoryItemType
  title?: string | null
  content: string
  pinned?: boolean
  metadata?: Record<string, unknown>
}

export interface UpdateMemoryItemInput {
  title?: string | null
  content?: string
  type?: MemoryItemType
  pinned?: boolean
  isArchived?: boolean
}
