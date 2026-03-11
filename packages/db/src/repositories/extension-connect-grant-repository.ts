import type { ExtensionConnectGrantRow } from "@relay/shared"

import { toExtensionConnectGrantRow } from "../mappers/relay-v2-mapper"
import type { DatabaseProvider } from "../store/provider"

export class ExtensionConnectGrantRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async create(input: {
    userId: string
    deviceName: string
    grantHash: string
    grantPrefix: string
    apiBase: string
    expiresAt: string
  }): Promise<ExtensionConnectGrantRow> {
    const rows = await this.provider.query(
      `insert into extension_connect_grants (user_id, device_name, grant_hash, grant_prefix, api_base, expires_at)
       values ($1, $2, $3, $4, $5, $6)
       returning *`,
      [input.userId, input.deviceName, input.grantHash, input.grantPrefix, input.apiBase, input.expiresAt]
    )

    return toExtensionConnectGrantRow(rows[0] as Record<string, unknown>)
  }

  async getValidByHash(grantHash: string): Promise<ExtensionConnectGrantRow | null> {
    const rows = await this.provider.query(
      `select *
       from extension_connect_grants
       where grant_hash = $1
         and consumed_at is null
         and expires_at > now()
       limit 1`,
      [grantHash]
    )

    const row = rows[0]
    return row ? toExtensionConnectGrantRow(row as Record<string, unknown>) : null
  }

  async consume(id: string): Promise<void> {
    await this.provider.query(
      `update extension_connect_grants
       set consumed_at = now()
       where id = $1`,
      [id]
    )
  }
}
