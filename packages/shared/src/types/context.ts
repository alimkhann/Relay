import type {
  ContextPacketRow,
  MemoryItemRow,
  ProjectRow,
  SourceSessionRow,
  TargetPlatform,
  TargetProfileRow
} from "./database"

export interface ContextCompositionInput {
  project: ProjectRow
  targetProfile: TargetProfileRow
  recentSessions: SourceSessionRow[]
  memoryItems: MemoryItemRow[]
}

export interface ComposedContextPacket extends Pick<ContextPacketRow, "content" | "sourceSnapshot"> {
  targetProfileKey: string
  targetPlatform: TargetPlatform
}
