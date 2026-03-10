import type { UserSettingsRow } from "@relay/shared"
import { isoNow } from "@relay/shared"

import { toSettingsRow } from "../mappers/memory-mapper"
import type { DatabaseProvider } from "../store/provider"

export class SettingsRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async getByUser(userId: string): Promise<UserSettingsRow | null> {
    if (this.provider.mode === "memory") {
      return this.provider.store.userSettings.find((settings) => settings.userId === userId) ?? null
    }

    const { data, error } = await this.provider.client.from("user_settings").select("*").eq("user_id", userId).maybeSingle()

    if (error) throw error
    return data ? toSettingsRow(data) : null
  }

  async update(userId: string, settings: UserSettingsRow["settings"]): Promise<UserSettingsRow> {
    if (this.provider.mode === "memory") {
      const existing = await this.getByUser(userId)
      if (existing) {
        existing.settings = settings
        existing.updatedAt = isoNow()
        return existing
      }

      const created: UserSettingsRow = {
        userId,
        settings,
        createdAt: isoNow(),
        updatedAt: isoNow()
      }
      this.provider.store.userSettings.push(created)
      return created
    }

    const { data, error } = await this.provider.client
      .from("user_settings")
      .upsert({
        user_id: userId,
        settings
      })
      .select("*")
      .single()

    if (error) throw error
    return toSettingsRow(data)
  }
}
