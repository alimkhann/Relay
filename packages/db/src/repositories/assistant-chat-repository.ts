import type { AssistantChatRow, AssistantSurface } from "@relay/shared"

import { toAssistantChatRow } from "../mappers/assistant-mapper"
import type { DatabaseProvider } from "../store/provider"

export class AssistantChatRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async create(input: {
    userId: string
    projectId?: string | null
    title?: string
    surface?: AssistantSurface
  }): Promise<AssistantChatRow> {
    const rows = await this.provider.query(
      `insert into assistant_chats (user_id, project_id, title, surface)
       values ($1, $2, coalesce($3, 'New chat'), coalesce($4, 'dashboard'))
       returning *`,
      [input.userId, input.projectId ?? null, input.title ?? null, input.surface ?? null]
    )
    return toAssistantChatRow(rows[0] as Record<string, unknown>)
  }

  async getById(id: string): Promise<AssistantChatRow | null> {
    const rows = await this.provider.query(
      `select * from assistant_chats where id = $1 limit 1`,
      [id]
    )
    const row = rows[0]
    return row ? toAssistantChatRow(row as Record<string, unknown>) : null
  }

  async listByUser(userId: string, options: { limit?: number } = {}): Promise<AssistantChatRow[]> {
    // Hide empty chats — created speculatively by attachment uploads or
    // brand-new-chat taps that the user never sent a message in.
    const rows = await this.provider.query(
      `select c.* from assistant_chats c
       where c.user_id = $1
         and exists (
           select 1 from assistant_messages m
           where m.chat_id = c.id and m.role = 'user'
         )
       order by c.updated_at desc
       limit $2`,
      [userId, options.limit ?? 50]
    )
    return rows.map((row) => toAssistantChatRow(row as Record<string, unknown>))
  }

  async searchByUser(userId: string, query: string, options: { limit?: number } = {}): Promise<AssistantChatRow[]> {
    const rows = await this.provider.query(
      `select c.* from assistant_chats c
       where c.user_id = $1 and c.title ilike $2
         and exists (
           select 1 from assistant_messages m
           where m.chat_id = c.id and m.role = 'user'
         )
       order by c.updated_at desc
       limit $3`,
      [userId, `%${query}%`, options.limit ?? 50]
    )
    return rows.map((row) => toAssistantChatRow(row as Record<string, unknown>))
  }

  async rename(id: string, title: string): Promise<void> {
    await this.provider.query(
      `update assistant_chats set title = $2, updated_at = now() where id = $1`,
      [id, title]
    )
  }

  async touch(id: string): Promise<void> {
    await this.provider.query(
      `update assistant_chats set updated_at = now() where id = $1`,
      [id]
    )
  }

  async remove(id: string): Promise<void> {
    await this.provider.query(`delete from assistant_chats where id = $1`, [id])
  }
}
