import type { RelayOnboardingCompletionSurface, RelayOnboardingStatus, UserOnboardingRow } from "@relay/shared"

import { toUserOnboardingRow } from "../mappers/auth-mapper"
import type { DatabaseProvider } from "../store/provider"

export class UserOnboardingRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async getByUser(userId: string): Promise<UserOnboardingRow | null> {
    const rows = await this.provider.query(
      `select *
       from user_onboarding
       where user_id = $1
       limit 1`,
      [userId]
    )

    const row = rows[0]
    return row ? toUserOnboardingRow(row as Record<string, unknown>) : null
  }

  async upsert(input: {
    userId: string
    status: RelayOnboardingStatus
    completedProjectId?: string | null
    completedVia?: RelayOnboardingCompletionSurface | null
    completedAt?: string | null
  }): Promise<UserOnboardingRow> {
    const rows = await this.provider.query(
      `insert into user_onboarding (
         user_id,
         status,
         completed_project_id,
         completed_via,
         completed_at
       )
       values ($1, $2, $3, $4, $5)
       on conflict (user_id) do update
       set status = excluded.status,
           completed_project_id = excluded.completed_project_id,
           completed_via = excluded.completed_via,
           completed_at = excluded.completed_at,
           updated_at = now()
       returning *`,
      [
        input.userId,
        input.status,
        input.completedProjectId ?? null,
        input.completedVia ?? null,
        input.completedAt ?? null
      ]
    )

    return toUserOnboardingRow(rows[0] as Record<string, unknown>)
  }
}
