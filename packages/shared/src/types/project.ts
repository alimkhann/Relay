import type { BootstrapPacketKind, MemoryItemType, SupportedPlatform } from "./database"

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
  projectState: ProjectStateDto | null
  derivedProjectState: ProjectStateDto | null
  stateOverrides: ProjectStateOverrideDto | null
  stateStatus: ProjectStateStatusDto
  recentSessions: RecentSessionDto[]
  sessionHistory: RecentSessionDto[]
  recentDigests: SessionDigestDto[]
  memory: MemoryItemDto[]
  packets: BootstrapPacketDto[]
  legacyPackets: ContextPacketDto[]
  aiBudget: ProjectAiBudgetDto
}

export interface ProjectStateStatusDto {
  rawCapturePresent: boolean
  digestStatus: "idle" | "pending" | "running" | "completed" | "failed" | "timed_out"
  projectStateReady: boolean
  digestErrorMessage: string | null
  lastCapturedAt: string | null
  lastDigestAt: string | null
  activeJobId: string | null
  activeJobStatus: "idle" | "pending" | "running" | "completed" | "failed" | "timed_out"
  activeJobStage: string | null
  activeJobAttempts: number
  fallbackPlanned: boolean
  fallbackUsed: boolean
}

export interface RecentSessionDto {
  id: string
  platform: SupportedPlatform
  title: string | null
  url: string
  pageFingerprint: string | null
  captureSignature: string | null
  isArchived: boolean
  archivedAt: string | null
  capturedAt: string
  turnCount: number
}

export interface ContextPacketDto {
  id: string
  content: string
  targetProfileKey: string
  createdAt: string
}

export interface BootstrapPacketDto {
  id: string
  kind: BootstrapPacketKind
  content: string
  targetProfileKey: string
  renderer: "deterministic" | "gemini"
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

export interface ProjectStateDto {
  projectOverview: string | null
  currentObjective: string | null
  stackDomain: string | null
  recentProgress: string | null
  decisions: string[]
  constraints: string[]
  openTasks: string[]
  relevantTools: string[]
  lastBootstrapAt: string | null
  dirty: boolean
  updatedAt: string
}

export interface ProjectStateOverrideDto {
  projectOverviewOverride: string | null
  currentObjectiveOverride: string | null
  recentProgressOverride: string | null
  hiddenDecisions: string[]
  hiddenConstraints: string[]
  hiddenOpenTasks: string[]
  updatedAt: string
}

export interface SessionDigestDto {
  id: string
  sourceSessionId: string
  summaryShort: string
  confidence: number
  importanceScore: number
  shouldMerge: boolean
  createdAt: string
}

export interface ProjectAiBudgetDto {
  plan: "free"
  aiEligible: boolean
  reason: string | null
  dailyProjectAiUsed: number
  dailyProjectAiLimit: number
  dailyUserAiUsed: number
  dailyUserAiLimit: number
  nextAiAllowedAt: string | null
}
