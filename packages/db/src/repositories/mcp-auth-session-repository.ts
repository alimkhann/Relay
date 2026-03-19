import type { McpTokenScope, McpAuthSessionRow } from "@relay/shared"

import { toMcpAuthSessionRow } from "../mappers/auth-mapper"
import type { DatabaseProvider } from "../store/provider"

export class McpAuthSessionRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async create(input: {
    sessionCode: string
    sessionHash: string
    sessionPrefix: string
    codeChallenge: string
    projectId: string
    scopes: McpTokenScope[]
    expiresAt: string
  }): Promise<McpAuthSessionRow> {
    const rows = await this.provider.query(
      `insert into mcp_auth_sessions (
         session_code,
         session_hash,
         session_prefix,
         code_challenge,
         project_id,
         scopes,
         expires_at
       )
       values ($1, $2, $3, $4, $5, $6, $7)
       returning *`,
      [
        input.sessionCode,
        input.sessionHash,
        input.sessionPrefix,
        input.codeChallenge,
        input.projectId,
        input.scopes,
        input.expiresAt
      ]
    )

    return toMcpAuthSessionRow(rows[0] as Record<string, unknown>)
  }

  async getByHash(sessionHash: string): Promise<McpAuthSessionRow | null> {
    const rows = await this.provider.query(
      `select *
       from mcp_auth_sessions
       where session_hash = $1
         and expires_at > now()
       limit 1`,
      [sessionHash]
    )
    const row = rows[0]
    return row ? toMcpAuthSessionRow(row as Record<string, unknown>) : null
  }

  async getByCode(sessionCode: string): Promise<McpAuthSessionRow | null> {
    const rows = await this.provider.query(
      `select *
       from mcp_auth_sessions
       where session_code = $1
         and status = 'pending'
         and expires_at > now()
       limit 1`,
      [sessionCode]
    )
    const row = rows[0]
    return row ? toMcpAuthSessionRow(row as Record<string, unknown>) : null
  }

  async approve(id: string, userId: string): Promise<void> {
    await this.provider.query(
      `update mcp_auth_sessions
       set user_id = $2, status = 'approved', approved_at = now()
       where id = $1`,
      [id, userId]
    )
  }

  async claimApproved(id: string): Promise<boolean> {
    const rows = await this.provider.query(
      `update mcp_auth_sessions
       set status = 'exchanging'
       where id = $1 and status = 'approved'
       returning id`,
      [id]
    )

    return rows.length > 0
  }

  async markExchanged(input: {
    id: string
    accessToken: string
    refreshToken: string
    accessExpiresAt: string
    refreshExpiresAt: string
  }): Promise<void> {
    await this.provider.query(
      `update mcp_auth_sessions
       set status = 'exchanged',
           access_token = $2,
           refresh_token = $3,
           access_expires_at = $4,
           refresh_expires_at = $5
       where id = $1 and status = 'exchanging'`,
      [input.id, input.accessToken, input.refreshToken, input.accessExpiresAt, input.refreshExpiresAt]
    )
  }
}
