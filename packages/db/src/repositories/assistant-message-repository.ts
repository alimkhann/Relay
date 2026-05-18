import type { AssistantMessageFeedback, AssistantMessageRole, AssistantMessageRow } from "@relay/shared"

import { toAssistantMessageRow } from "../mappers/assistant-mapper"
import { encryptTextIfConfigured } from "../utils/encrypted-text"
import type { DatabaseProvider } from "../store/provider"

export class AssistantMessageRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async create(input: {
    chatId: string
    userId: string
    parentId?: string | null
    role: AssistantMessageRole
    content: string
    toolName?: string | null
    toolPayload?: Record<string, unknown>
    tokenInput?: number
    tokenOutput?: number
  }): Promise<AssistantMessageRow> {
    const rows = await this.provider.query(
      `insert into assistant_messages
         (chat_id, user_id, parent_id, role, content, tool_name, tool_payload, token_input, token_output)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
       returning *`,
      [
        input.chatId,
        input.userId,
        input.parentId ?? null,
        input.role,
        input.content ? encryptTextIfConfigured(input.content) : "",
        input.toolName ?? null,
        JSON.stringify(input.toolPayload ?? {}),
        input.tokenInput ?? 0,
        input.tokenOutput ?? 0
      ]
    )
    return toAssistantMessageRow(rows[0] as Record<string, unknown>)
  }

  async getById(id: string): Promise<AssistantMessageRow | null> {
    const rows = await this.provider.query(
      `select * from assistant_messages where id = $1 limit 1`,
      [id]
    )
    const row = rows[0]
    return row ? toAssistantMessageRow(row as Record<string, unknown>) : null
  }

  async setFeedback(id: string, feedback: AssistantMessageFeedback | null): Promise<void> {
    await this.provider.query(
      `update assistant_messages set feedback = $2 where id = $1`,
      [id, feedback]
    )
  }

  async listByChat(chatId: string, options: { limit?: number } = {}): Promise<AssistantMessageRow[]> {
    const rows = await this.provider.query(
      `select * from assistant_messages
       where chat_id = $1
       order by created_at asc
       limit $2`,
      [chatId, options.limit ?? 200]
    )
    return rows.map((row) => toAssistantMessageRow(row as Record<string, unknown>))
  }
}
