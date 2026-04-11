import type { MemoryEventRow, MemoryEventType } from "@relay/shared"

export function toMemoryEventRow(record: Record<string, unknown>): MemoryEventRow {
  return {
    id: String(record.id),
    projectId: String(record.project_id),
    memoryItemId: record.memory_item_id ? String(record.memory_item_id) : null,
    eventType: String(record.event_type) as MemoryEventType,
    sourceSurface: record.source_surface ? String(record.source_surface) : null,
    userId: record.user_id ? String(record.user_id) : null,
    payload: (record.payload as Record<string, unknown>) ?? {},
    createdAt: String(record.created_at),
  }
}
