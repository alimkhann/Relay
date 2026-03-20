import type { ParsedTurn, SourceTurnRow } from "@relay/shared"
import { hashContent, normalizeText } from "@relay/shared"

import { toTurnRow } from "../mappers/session-mapper"
import type { DatabaseProvider } from "../store/provider"
import { encryptTextIfConfigured } from "../utils/encrypted-text"

export class TurnRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async listBySession(sessionId: string): Promise<SourceTurnRow[]> {
    const rows = await this.provider.query(
      `select *
       from source_turns
       where session_id = $1
       order by turn_index asc`,
      [sessionId]
    )

    return rows.map((record) => toTurnRow(record as Record<string, unknown>))
  }

  async insertDeduped(sessionId: string, turns: ParsedTurn[]): Promise<SourceTurnRow[]> {
    const created: SourceTurnRow[] = []

    for (const turn of turns) {
      const content = normalizeText(turn.content)
      const encryptedContent = encryptTextIfConfigured(content)
      const encryptedRawHtml = turn.rawHtml ? encryptTextIfConfigured(turn.rawHtml) : null
      const rows = await this.provider.query(
        `insert into source_turns (session_id, role, turn_index, content, content_hash, raw_html, metadata)
         values ($1, $2, $3, $4, $5, $6, '{}'::jsonb)
         on conflict (session_id, content_hash) do nothing
         returning *`,
        [sessionId, turn.role, turn.turnIndex, encryptedContent, hashContent(content), encryptedRawHtml]
      )

      if (rows[0]) {
        created.push(toTurnRow(rows[0] as Record<string, unknown>))
      }
    }

    return created
  }
}
