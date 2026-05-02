import type { SourceSessionRow, SourceTurnRow } from "@relay/shared"

import { decryptTextIfNeeded } from "../utils/encrypted-text"
import { toTimestamp } from "./timestamp"

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
    captureSignature: record.capture_signature ? String(record.capture_signature) : null,
    sourceConversationId: record.source_conversation_id ? String(record.source_conversation_id) : null,
    metadata: (record.metadata as Record<string, unknown>) ?? {},
    isArchived: Boolean(record.is_archived),
    archivedAt: record.archived_at ? toTimestamp(record.archived_at) : null,
    archivedBy: record.archived_by ? String(record.archived_by) : null,
    capturedAt: toTimestamp(record.captured_at),
    createdAt: toTimestamp(record.created_at)
  }
}

export function toTurnRow(record: Record<string, unknown>): SourceTurnRow {
  return {
    id: String(record.id),
    sessionId: String(record.session_id),
    role: record.role as SourceTurnRow["role"],
    turnIndex: Number(record.turn_index),
    content: decryptTextIfNeeded(String(record.content)),
    contentHash: String(record.content_hash),
    rawHtml: record.raw_html ? decryptTextIfNeeded(String(record.raw_html)) : null,
    metadata: (record.metadata as Record<string, unknown>) ?? {},
    createdAt: toTimestamp(record.created_at)
  }
}
