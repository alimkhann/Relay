import type { ExtensionApiTokenPurpose, ExtensionApiTokenRow } from "@relay/shared"

import { toExtensionApiTokenRow } from "../mappers/auth-mapper"
import type { DatabaseProvider } from "../store/provider"

export class ExtensionTokenRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async listByUser(userId: string): Promise<ExtensionApiTokenRow[]> {
    const rows = await this.provider.query(
      `select *
       from extension_api_tokens
       where user_id = $1
         and revoked_at is null
       order by created_at desc`,
      [userId]
    )

    return rows.map((row) => toExtensionApiTokenRow(row as Record<string, unknown>))
  }

  async getValidByHash(tokenHash: string): Promise<ExtensionApiTokenRow | null> {
    const rows = await this.provider.query(
      `select *
       from extension_api_tokens
       where token_hash = $1
         and revoked_at is null
         and (expires_at is null or expires_at > now())
       limit 1`,
      [tokenHash]
    )

    const row = rows[0]
    return row ? toExtensionApiTokenRow(row as Record<string, unknown>) : null
  }

  async create(input: {
    userId: string
    deviceName: string
    purpose: ExtensionApiTokenPurpose
    tokenHash: string
    tokenPrefix: string
  }): Promise<ExtensionApiTokenRow> {
    const rows = await this.provider.query(
      `insert into extension_api_tokens (user_id, device_name, purpose, token_hash, token_prefix)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [input.userId, input.deviceName, input.purpose, input.tokenHash, input.tokenPrefix]
    )

    return toExtensionApiTokenRow(rows[0] as Record<string, unknown>)
  }

  async touch(id: string): Promise<void> {
    await this.provider.query(
      `update extension_api_tokens
       set last_used_at = now()
       where id = $1`,
      [id]
    )
  }

  async touchIfStale(id: string, staleBeforeMinutes = 15): Promise<void> {
    await this.provider.query(
      `update extension_api_tokens
       set last_used_at = now()
       where id = $1
         and (last_used_at is null or last_used_at < now() - make_interval(mins => $2))`,
      [id, staleBeforeMinutes]
    )
  }

  async revoke(userId: string, id: string): Promise<void> {
    await this.provider.query(
      `update extension_api_tokens
       set revoked_at = now()
       where id = $1 and user_id = $2`,
      [id, userId]
    )
  }

  async revokeOthersByPurpose(
    userId: string,
    purpose: ExtensionApiTokenPurpose,
    exceptId: string
  ): Promise<number> {
    const rows = await this.provider.query(
      `update extension_api_tokens
       set revoked_at = now()
       where user_id = $1
         and purpose = $2
         and id <> $3
         and revoked_at is null
       returning id`,
      [userId, purpose, exceptId]
    )
    return rows.length
  }

  async revokeOlderDuplicates(
    userId: string,
    deviceName: string,
    purpose: ExtensionApiTokenPurpose,
    exceptId: string
  ): Promise<number> {
    const rows = await this.provider.query(
      `update extension_api_tokens
       set revoked_at = now()
       where user_id = $1
         and device_name = $2
         and purpose = $3
         and id <> $4
         and revoked_at is null
       returning id`,
      [userId, deviceName, purpose, exceptId]
    )
    return rows.length
  }
}
