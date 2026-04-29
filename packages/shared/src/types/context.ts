import type {
  BootstrapPacketKind,
  BootstrapPacketRow,
  SyncSurface,
  WorkSessionRow,
  WorkSessionCheckpointWithSessionRow,
  ProjectStateRow,
  ContextPacketRow,
  MemoryItemRow,
  ProjectRow,
  SessionDigestRow,
  SourceTurnRole,
  SourceSessionRow,
  TargetPlatform,
  TargetProfileRow,
  SupportedPlatform
} from "./database"
import type { BootstrapPacketDto, ProjectStateStatusDto } from "./project"

export interface RecentTurnSnippet {
  sessionId: string
  sessionTitle: string | null
  platform: SupportedPlatform
  role: SourceTurnRole
  content: string
}

export interface ContextCompositionInput {
  project: ProjectRow
  targetProfile: TargetProfileRow
  recentSessions: SourceSessionRow[]
  recentTurns: RecentTurnSnippet[]
  memoryItems: MemoryItemRow[]
}

export interface ComposedContextPacket extends Pick<ContextPacketRow, "content" | "sourceSnapshot"> {
  targetProfileKey: string
  targetPlatform: TargetPlatform
}

export interface SessionDigestShape {
  summaryShort: string
  newDecisions: string[]
  newConstraints: string[]
  newTasks: string[]
  projectOverviewDelta: string | null
  currentObjectiveDelta: string | null
  recentProgressDelta: string | null
  relevantToolsDelta: string[]
  importanceScore: number
  shouldMerge: boolean
}

export interface BootstrapCompositionInput {
  project: ProjectRow
  projectState: ProjectStateRow | null
  targetProfile: TargetProfileRow
  recentDigests: SessionDigestRow[]
  recentSessions: SourceSessionRow[]
}

export interface WorkSessionStructuredState {
  summary?: string | null
  progress?: string | null
  currentObjective?: string | null
  decisions?: string[]
  constraints?: string[]
  nextSteps?: string[]
  notes?: string[]
  relevantTools?: string[]
  touchedFiles?: string[]
  reaffirmedFacts?: string[]
}

export interface WorkSessionOpenRequest {
  surface: SyncSurface
  workspaceId?: string
  threadId?: string
  agentName?: string
  clientName?: string
  associationMethod?: string
  associationConfidence?: number
}

export interface WorkSessionOpenResponse {
  session: WorkSessionRow
}

export interface WorkSessionCheckpointRequest {
  sessionId: string
  eventType?: string
  eventPayload?: Record<string, unknown>
  summaryShort?: string
  structuredState: WorkSessionStructuredState
  confidence?: number
}

export interface WorkSessionCloseRequest {
  sessionId: string
  summaryShort?: string
  structuredState?: WorkSessionStructuredState
  confidence?: number
}

export interface WorkSessionCloseResponse {
  session: WorkSessionRow
}

export interface RecentWorkSessionContext {
  checkpoints: WorkSessionCheckpointWithSessionRow[]
}

export interface BootstrapPacketResult extends Pick<BootstrapPacketRow, "content" | "structuredSnapshot" | "renderer" | "generationMetadata" | "kind"> {
  targetProfileKey: string
  targetPlatform: TargetPlatform
}

export interface BootstrapRequest {
  kind: BootstrapPacketKind
  targetProfileKey: string
  packetMode?: "chat_new" | "chat_continue" | "chat_smart_delta" | "agent_quick_continuity" | "agent_full_bootstrap"
  deep?: boolean
  since?: string
  syncSurface?: SyncSurface
}

export interface BootstrapGenerationResponse {
  status: "ready" | "pending"
  packet: BootstrapPacketDto | null
  reason: string | null
  resolvedTargetProfileKey: string
  stateStatus: ProjectStateStatusDto
}
