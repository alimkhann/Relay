import type {
  ContextPacketRow,
  MemoryItemRow,
  ProjectRow,
  SourceTurnRole,
  SourceSessionRow,
  TargetPlatform,
  TargetProfileRow,
  SupportedPlatform
} from "./database"

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
