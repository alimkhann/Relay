import type { TargetProfileRow } from "@relay/shared"

import { toTargetProfileRow } from "../mappers/memory-mapper"
import type { DatabaseProvider } from "../store/provider"

export class TargetProfileRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async listAll(): Promise<TargetProfileRow[]> {
    const rows = await this.provider.query(
      `select *
       from target_profiles
       order by name asc`
    )

    return rows.map((record) => toTargetProfileRow(record as Record<string, unknown>))
  }

  async getByKey(key: string): Promise<TargetProfileRow | null> {
    const rows = await this.provider.query(
      `select *
       from target_profiles
       where key = $1
       limit 1`,
      [key]
    )

    const row = rows[0]
    return row ? toTargetProfileRow(row as Record<string, unknown>) : null
  }
}
