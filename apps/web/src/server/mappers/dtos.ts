import type { ContextPacketDto, ContextPacketRow, MemoryItemDto, MemoryItemRow, ProjectSummaryDto, SourceSessionRow } from "@relay/shared"

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
