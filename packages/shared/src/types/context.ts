import type {
  BootstrapPacketKind,
  BootstrapPacketRow,
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

export interface BootstrapPacketResult extends Pick<BootstrapPacketRow, "content" | "structuredSnapshot" | "renderer" | "generationMetadata" | "kind"> {
  targetProfileKey: string
  targetPlatform: TargetPlatform
}

export interface BootstrapRequest {
  kind: BootstrapPacketKind
  targetProfileKey: string
  deep?: boolean
}

export interface BootstrapGenerationResponse {
  status: "ready" | "pending"
  packet: BootstrapPacketDto | null
  reason: string | null
  resolvedTargetProfileKey: string
  stateStatus: ProjectStateStatusDto
}
