import type { AssistantAttachmentRow, AssistantChatRow, AssistantMessageRow } from "@relay/shared"

import { decryptTextIfNeeded } from "../utils/encrypted-text"
import { toTimestamp } from "./timestamp"

export function toAssistantChatRow(record: Record<string, unknown>): AssistantChatRow {
  return {
    id: String(record.id),
    userId: String(record.user_id),
    projectId: record.project_id ? String(record.project_id) : null,
    title: String(record.title),
    surface: record.surface as AssistantChatRow["surface"],
    createdAt: toTimestamp(record.created_at),
    updatedAt: toTimestamp(record.updated_at)
  }
}

export function toAssistantMessageRow(record: Record<string, unknown>): AssistantMessageRow {
  const content = String(record.content ?? "")
  return {
    id: String(record.id),
    chatId: String(record.chat_id),
    userId: String(record.user_id),
    parentId: record.parent_id ? String(record.parent_id) : null,
    role: record.role as AssistantMessageRow["role"],
    content: content ? decryptTextIfNeeded(content) : "",
    toolName: record.tool_name ? String(record.tool_name) : null,
    toolPayload: (record.tool_payload as Record<string, unknown>) ?? {},
    feedback: (record.feedback as AssistantMessageRow["feedback"]) ?? null,
    tokenInput: Number(record.token_input ?? 0),
    tokenOutput: Number(record.token_output ?? 0),
    createdAt: toTimestamp(record.created_at)
  }
}

export function toAssistantAttachmentRow(record: Record<string, unknown>): AssistantAttachmentRow {
  return {
    id: String(record.id),
    chatId: String(record.chat_id),
    userId: String(record.user_id),
    fileName: String(record.file_name),
    mime: String(record.mime),
    byteSize: Number(record.byte_size ?? 0),
    storageKey: String(record.storage_key),
    extractedText: record.extracted_text ? decryptTextIfNeeded(String(record.extracted_text)) : null,
    savedToRelay: Boolean(record.saved_to_relay),
    createdAt: toTimestamp(record.created_at)
  }
}
