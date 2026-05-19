import type { AssistantAttachmentRow } from "@relay/shared"

import { toAssistantAttachmentRow } from "../mappers/assistant-mapper"
import { encryptTextIfConfigured } from "../utils/encrypted-text"
import type { DatabaseProvider } from "../store/provider"

export class AssistantAttachmentRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async create(input: {
    chatId: string
    userId: string
    fileName: string
    mime: string
    byteSize: number
    storageKey: string
    extractedText?: string | null
  }): Promise<AssistantAttachmentRow> {
    const rows = await this.provider.query(
      `insert into assistant_attachments
         (chat_id, user_id, file_name, mime, byte_size, storage_key, extracted_text)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning *`,
      [
        input.chatId,
        input.userId,
        input.fileName,
        input.mime,
        input.byteSize,
        input.storageKey,
        input.extractedText ? encryptTextIfConfigured(input.extractedText) : null
      ]
    )
    return toAssistantAttachmentRow(rows[0] as Record<string, unknown>)
  }

  async listByChat(chatId: string): Promise<AssistantAttachmentRow[]> {
    const rows = await this.provider.query(
      `select * from assistant_attachments
       where chat_id = $1
       order by created_at desc`,
      [chatId]
    )
    return rows.map((row) => toAssistantAttachmentRow(row as Record<string, unknown>))
  }

  async listByIds(ids: string[], userId: string): Promise<AssistantAttachmentRow[]> {
    if (ids.length === 0) return []
    const rows = await this.provider.query(
      `select * from assistant_attachments
       where id = any($1::uuid[]) and user_id = $2`,
      [ids, userId]
    )
    return rows.map((row) => toAssistantAttachmentRow(row as Record<string, unknown>))
  }

  async markSaved(id: string): Promise<void> {
    await this.provider.query(
      `update assistant_attachments set saved_to_relay = true where id = $1`,
      [id]
    )
  }
}
