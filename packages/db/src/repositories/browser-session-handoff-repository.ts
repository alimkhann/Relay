import type { BrowserSessionHandoffRow } from "@relay/shared"

import { toBrowserSessionHandoffRow } from "../mappers/auth-mapper"
import type { DatabaseProvider } from "../store/provider"

export class BrowserSessionHandoffRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async create(input: {
    userId: string
    handoffHash: string
    handoffPrefix: string
    encryptedGoogleAccessToken: string
    encryptedGoogleIdToken: string
    nextPath: string
    expiresAt: string
  }): Promise<BrowserSessionHandoffRow> {
    const rows = await this.provider.query(
      `insert into browser_session_handoffs (
         user_id,
         handoff_hash,
         handoff_prefix,
         encrypted_google_access_token,
         encrypted_google_id_token,
         next_path,
         expires_at
       )
       values ($1, $2, $3, $4, $5, $6, $7)
       returning *`,
      [
        input.userId,
        input.handoffHash,
        input.handoffPrefix,
        input.encryptedGoogleAccessToken,
        input.encryptedGoogleIdToken,
        input.nextPath,
        input.expiresAt
      ]
    )

    return toBrowserSessionHandoffRow(rows[0] as Record<string, unknown>)
  }

  async getValidByHash(handoffHash: string): Promise<BrowserSessionHandoffRow | null> {
    const rows = await this.provider.query(
      `select *
       from browser_session_handoffs
       where handoff_hash = $1
         and consumed_at is null
         and expires_at > now()
       limit 1`,
      [handoffHash]
    )

    const row = rows[0]
    return row ? toBrowserSessionHandoffRow(row as Record<string, unknown>) : null
  }

  async consume(id: string): Promise<void> {
    await this.provider.query(
      `update browser_session_handoffs
       set consumed_at = now()
       where id = $1`,
      [id]
    )
  }
}
