import type { BootstrapPacketKind, MemoryItemType, SourceSurface, SupportedPlatform } from "./database"

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
  routingContext: {
    hasMeaningfulContext: boolean
    keywords: string[]
  } | null
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
  /** Count of distinct conversations (by URL), not total capture rows */
  distinctConversationCount: number
  recentDigests: SessionDigestDto[]
  memory: MemoryItemDto[]
  packets: BootstrapPacketDto[]
  legacyPackets: ContextPacketDto[]
  aiBudget: ProjectAiBudgetDto
}

export interface ProjectStateStatusDto {
  rawCapturePresent: boolean
  digestStatus: "idle" | "pending" | "running" | "completed" | "failed" | "timed_out" | "deferred"
  projectStateReady: boolean
  digestErrorMessage: string | null
  lastCapturedAt: string | null
  lastDigestAt: string | null
  activeJobId: string | null
  activeJobStatus: "idle" | "pending" | "running" | "completed" | "failed" | "timed_out" | "deferred"
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
  sourceConversationId: string | null
  isArchived: boolean
  archivedAt: string | null
  capturedAt: string
  turnCount: number
}

/** A group of captures from the same conversation, collapsed for activity display */
export interface GroupedSessionDto {
  /** Conversation identifier (e.g., "c/abc123" for ChatGPT) */
  conversationId: string
  platform: SupportedPlatform
  /** Title from the most recent capture */
  title: string | null
  /** URL from the most recent capture */
  url: string
  /** Number of captures in this group */
  captureCount: number
  /** Total turns across all captures in the group */
  totalTurns: number
  /** Most recent capture timestamp */
  lastCapturedAt: string
  /** Oldest capture timestamp in the group */
  firstCapturedAt: string
  /** IDs of all sessions in this group (most recent first) */
  sessionIds: string[]
  /** Whether all sessions in the group are archived */
  allArchived: boolean
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
  metadata?: Record<string, unknown>
  /** Origin surface: chatgpt, claude, gemini, grok, perplexity, deepseek, codex, mcp, web, api */
  sourceSurface: SourceSurface | null
  /** Full URL to source conversation for clickable provenance links */
  sourceUrl: string | null
  /** Actual capture timestamp for recency-based conflict resolution */
  capturedAt: string | null
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
  plan: "free" | "pro"
  aiEligible: boolean
  reason: string | null
  dailyProjectAiUsed: number
  dailyProjectAiLimit: number
  dailyUserAiUsed: number
  dailyUserAiLimit: number
  dailyProjectAiRemaining: number
  dailyUserAiRemaining: number
  nextAiAllowedAt: string | null
}
