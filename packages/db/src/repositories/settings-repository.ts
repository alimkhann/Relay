import type { UserSettingsRow } from "@relay/shared"

import { toSettingsRow } from "../mappers/memory-mapper"
import type { DatabaseProvider } from "../store/provider"

export class SettingsRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async getByUser(userId: string): Promise<UserSettingsRow | null> {
    const rows = await this.provider.query(
      `select *
       from user_settings
       where user_id = $1
       limit 1`,
      [userId]
    )

    const row = rows[0]
    return row ? toSettingsRow(row as Record<string, unknown>) : null
  }

  async update(userId: string, settings: UserSettingsRow["settings"]): Promise<UserSettingsRow> {
    const rows = await this.provider.query(
      `insert into user_settings (user_id, settings)
       values ($1, $2::jsonb)
       on conflict (user_id) do update
       set settings = excluded.settings,
           updated_at = now()
       returning *`,
      [userId, JSON.stringify(settings)]
    )

    return toSettingsRow(rows[0] as Record<string, unknown>)
  }
}
