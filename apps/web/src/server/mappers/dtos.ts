import type {
  BootstrapPacketDto,
  BootstrapPacketRow,
  ContextPacketDto,
  ContextPacketRow,
  MemoryItemDto,
  MemoryItemRow,
  ProjectStateDto,
  ProjectStateRow,
  ProjectSummaryDto,
  SessionDigestDto,
  SessionDigestRow,
  SourceSessionRow
} from "@relay/shared"

export function toProjectSummaryDto(project: ProjectSummaryDto): ProjectSummaryDto {
  return project
}

export function toMemoryItemDto(item: MemoryItemRow): MemoryItemDto {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    content: item.content,
    pinned: item.pinned,
    updatedAt: item.updatedAt
  }
}

export function toSessionDto(session: SourceSessionRow, turnCount: number) {
  return {
    id: session.id,
    platform: session.platform,
    title: session.title,
    url: session.url,
    capturedAt: session.capturedAt,
    turnCount
  }
}

export function toPacketDto(packet: ContextPacketRow, targetProfileKey: string): ContextPacketDto {
  return {
    id: packet.id,
    content: packet.content,
    targetProfileKey,
    createdAt: packet.createdAt
  }
}

export function toBootstrapPacketDto(packet: BootstrapPacketRow, targetProfileKey: string): BootstrapPacketDto {
  return {
    id: packet.id,
    kind: packet.kind,
    content: packet.content,
    targetProfileKey,
    renderer: packet.renderer,
    createdAt: packet.createdAt
  }
}

export function toProjectStateDto(state: ProjectStateRow): ProjectStateDto {
  return {
    projectOverview: state.projectOverview,
    currentObjective: state.currentObjective,
    stackDomain: state.stackDomain,
    recentProgress: state.recentProgress,
    decisions: state.decisions,
    constraints: state.constraints,
    openTasks: state.openTasks,
    relevantTools: state.relevantTools,
    lastBootstrapAt: state.lastBootstrapAt,
    dirty: state.dirty,
    updatedAt: state.updatedAt
  }
}

export function toSessionDigestDto(digest: SessionDigestRow): SessionDigestDto {
  return {
    id: digest.id,
    sourceSessionId: digest.sourceSessionId,
    summaryShort: digest.summaryShort,
    confidence: digest.confidence,
    importanceScore: digest.importanceScore,
    shouldMerge: digest.needsProjectStateMerge,
    createdAt: digest.createdAt
  }
}
