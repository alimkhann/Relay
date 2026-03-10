import type { MemoryItemType, SupportedPlatform } from "./database"

export type ProjectId = string

export interface Project {
  id: string
  ownerId: string
  name: string
  slug: string
  description: string | null
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export interface ProjectSummaryDto {
  id: string
  name: string
  slug: string
  description: string | null
  memoryCount: number
  sessionCount: number
  updatedAt: string
}

export interface ProjectDashboardDto {
  project: ProjectSummaryDto
  recentSessions: RecentSessionDto[]
  memory: MemoryItemDto[]
  packets: ContextPacketDto[]
}

export interface RecentSessionDto {
  id: string
  platform: SupportedPlatform
  title: string | null
  url: string
  capturedAt: string
  turnCount: number
}

export interface ContextPacketDto {
  id: string
  content: string
  targetProfileKey: string
  createdAt: string
}

export interface MemoryItemDto {
  id: string
  type: MemoryItemType
  title: string | null
  content: string
  pinned: boolean
  updatedAt: string
}
