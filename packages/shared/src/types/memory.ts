import type { MemoryItemType } from "./database"

export interface CreateMemoryItemInput {
  projectId: string
  sourceTurnId?: string | null
  type: MemoryItemType
  title?: string | null
  content: string
  pinned?: boolean
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface UpdateMemoryItemInput {
  title?: string | null
  content?: string
  type?: MemoryItemType
  pinned?: boolean
  tags?: string[]
  isArchived?: boolean
}
