import type { CliAuthSessionRow } from "@relay/shared"

import { toCliAuthSessionRow } from "../mappers/cli-auth-mapper"
import type { DatabaseProvider } from "../store/provider"

export class CliAuthSessionRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async create(input: {
    sessionCode: string
    sessionHash: string
    sessionPrefix: string
    deviceName: string
    expiresAt: string
  }): Promise<CliAuthSessionRow> {
    const rows = await this.provider.query(
      `insert into cli_auth_sessions (session_code, session_hash, session_prefix, device_name, expires_at)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [input.sessionCode, input.sessionHash, input.sessionPrefix, input.deviceName, input.expiresAt]
    )

    return toCliAuthSessionRow(rows[0] as Record<string, unknown>)
  }

  async getByHash(sessionHash: string): Promise<CliAuthSessionRow | null> {
    const rows = await this.provider.query(
      `select *
       from cli_auth_sessions
       where session_hash = $1
         and expires_at > now()
       limit 1`,
      [sessionHash]
    )

    const row = rows[0]
    return row ? toCliAuthSessionRow(row as Record<string, unknown>) : null
  }

  async getByCode(sessionCode: string): Promise<CliAuthSessionRow | null> {
    const rows = await this.provider.query(
      `select *
       from cli_auth_sessions
       where session_code = $1
         and status = 'pending'
         and expires_at > now()
       limit 1`,
      [sessionCode]
    )

    const row = rows[0]
    return row ? toCliAuthSessionRow(row as Record<string, unknown>) : null
  }

  async confirm(id: string, userId: string): Promise<void> {
    await this.provider.query(
      `update cli_auth_sessions
       set user_id = $2, status = 'confirmed', confirmed_at = now()
       where id = $1`,
      [id, userId]
    )
  }

  async markTokenIssued(id: string, apiToken: string): Promise<void> {
    await this.provider.query(
      `update cli_auth_sessions
       set api_token = $2
       where id = $1`,
      [id, apiToken]
    )
  }
}
