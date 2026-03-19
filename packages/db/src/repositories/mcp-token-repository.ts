import type { McpTokenRow, McpTokenScope } from "@relay/shared"

import { toMcpTokenRow } from "../mappers/auth-mapper"
import type { DatabaseProvider } from "../store/provider"

export class McpTokenRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async create(input: {
    userId: string
    projectId: string
    tokenHash: string
    tokenPrefix: string
    scopes: McpTokenScope[]
    expiresAt: string
    refreshTokenHash: string | null
    refreshTokenPrefix: string | null
    refreshExpiresAt: string | null
  }): Promise<McpTokenRow> {
    const rows = await this.provider.query(
      `insert into mcp_tokens (
         user_id,
         project_id,
         token_hash,
         token_prefix,
         scopes,
         expires_at,
         refresh_token_hash,
         refresh_token_prefix,
         refresh_expires_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning *`,
      [
        input.userId,
        input.projectId,
        input.tokenHash,
        input.tokenPrefix,
        input.scopes,
        input.expiresAt,
        input.refreshTokenHash,
        input.refreshTokenPrefix,
        input.refreshExpiresAt
      ]
    )

    return toMcpTokenRow(rows[0] as Record<string, unknown>)
  }

  async getValidAccessTokenByHash(tokenHash: string): Promise<McpTokenRow | null> {
    const rows = await this.provider.query(
      `select *
       from mcp_tokens
       where token_hash = $1
         and revoked_at is null
         and expires_at > now()
       limit 1`,
      [tokenHash]
    )

    const row = rows[0]
    return row ? toMcpTokenRow(row as Record<string, unknown>) : null
  }

  async getValidRefreshTokenByHash(refreshTokenHash: string): Promise<McpTokenRow | null> {
    const rows = await this.provider.query(
      `select *
       from mcp_tokens
       where refresh_token_hash = $1
         and revoked_at is null
         and refresh_expires_at is not null
         and refresh_expires_at > now()
       limit 1`,
      [refreshTokenHash]
    )

    const row = rows[0]
    return row ? toMcpTokenRow(row as Record<string, unknown>) : null
  }

  async rotate(input: {
    id: string
    tokenHash: string
    tokenPrefix: string
    expiresAt: string
    previousRefreshTokenHash: string | null
    refreshTokenHash: string | null
    refreshTokenPrefix: string | null
    refreshExpiresAt: string | null
  }): Promise<McpTokenRow | null> {
    const rows = await this.provider.query(
      `update mcp_tokens
       set token_hash = $2,
           token_prefix = $3,
           expires_at = $4,
           refresh_token_hash = $5,
           refresh_token_prefix = $6,
            refresh_expires_at = $7,
            rotation_count = rotation_count + 1,
            updated_at = now()
       where id = $1
         and (
           ($8::text is null and refresh_token_hash is null)
           or refresh_token_hash = $8
         )
        returning *`,
      [
        input.id,
        input.tokenHash,
        input.tokenPrefix,
        input.expiresAt,
        input.refreshTokenHash,
        input.refreshTokenPrefix,
        input.refreshExpiresAt,
        input.previousRefreshTokenHash,
      ]
    )

    const row = rows[0]
    return row ? toMcpTokenRow(row as Record<string, unknown>) : null
  }

  async revoke(id: string): Promise<void> {
    await this.provider.query(
      `update mcp_tokens
       set revoked_at = now(), updated_at = now()
       where id = $1`,
      [id]
    )
  }

  async touch(id: string): Promise<void> {
    await this.provider.query(
      `update mcp_tokens
       set last_used_at = now(),
           updated_at = now()
       where id = $1`,
      [id]
    )
  }

  async touchIfStale(id: string, staleBeforeMinutes = 15): Promise<void> {
    await this.provider.query(
      `update mcp_tokens
       set last_used_at = now(),
           updated_at = now()
       where id = $1
         and (last_used_at is null or last_used_at < now() - make_interval(mins => $2))`,
      [id, staleBeforeMinutes]
    )
  }
}
