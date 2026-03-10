import type { SourceSessionRow, SourceTurnRow } from "@relay/shared"

export function toSessionRow(record: Record<string, unknown>): SourceSessionRow {
  return {
    id: String(record.id),
    projectId: String(record.project_id),
    platform: record.platform as SourceSessionRow["platform"],
    url: String(record.url),
    title: record.title ? String(record.title) : null,
    tabId: record.tab_id ? String(record.tab_id) : null,
    windowId: record.window_id ? String(record.window_id) : null,
    pageFingerprint: record.page_fingerprint ? String(record.page_fingerprint) : null,
    metadata: (record.metadata as Record<string, unknown>) ?? {},
    capturedAt: String(record.captured_at),
    createdAt: String(record.created_at)
  }
}

export function toTurnRow(record: Record<string, unknown>): SourceTurnRow {
  return {
    id: String(record.id),
    sessionId: String(record.session_id),
    role: record.role as SourceTurnRow["role"],
    turnIndex: Number(record.turn_index),
    content: String(record.content),
    contentHash: String(record.content_hash),
    rawHtml: record.raw_html ? String(record.raw_html) : null,
    metadata: (record.metadata as Record<string, unknown>) ?? {},
    createdAt: String(record.created_at)
  }
}
