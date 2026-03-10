import type { TargetProfileRow } from "@relay/shared"

import { toTargetProfileRow } from "../mappers/memory-mapper"
import type { DatabaseProvider } from "../store/provider"

export class TargetProfileRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async listAll(): Promise<TargetProfileRow[]> {
    if (this.provider.mode === "memory") {
      return this.provider.store.targetProfiles
    }

    const { data, error } = await this.provider.client.from("target_profiles").select("*").order("name", { ascending: true })
    if (error) throw error
    return (data ?? []).map((record) => toTargetProfileRow(record))
  }

  async getByKey(key: string): Promise<TargetProfileRow | null> {
    if (this.provider.mode === "memory") {
      return this.provider.store.targetProfiles.find((profile) => profile.key === key) ?? null
    }

    const { data, error } = await this.provider.client.from("target_profiles").select("*").eq("key", key).maybeSingle()
    if (error) throw error
    return data ? toTargetProfileRow(data) : null
  }
}
