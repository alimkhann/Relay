import type { ProfileRow } from "@relay/shared"

import { toProfileRow } from "../mappers/auth-mapper"
import type { DatabaseProvider } from "../store/provider"

export class ProfileRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async getById(id: string): Promise<ProfileRow | null> {
    const rows = await this.provider.query(
      `select *
       from profiles
       where id = $1
       limit 1`,
      [id]
    )

    const row = rows[0]
    return row ? toProfileRow(row as Record<string, unknown>) : null
  }

  async getByEmail(email: string): Promise<ProfileRow | null> {
    const rows = await this.provider.query(
      `select *
       from profiles
       where lower(email) = lower($1)
       limit 1`,
      [email]
    )

    const row = rows[0]
    return row ? toProfileRow(row as Record<string, unknown>) : null
  }

  async upsert(input: { id: string; email?: string | null; displayName?: string | null; avatarUrl?: string | null }): Promise<ProfileRow> {
    const rows = await this.provider.query(
      `insert into profiles (id, email, display_name, avatar_url)
       values ($1, $2, $3, $4)
       on conflict (id) do update
       set email = excluded.email,
           display_name = excluded.display_name,
           avatar_url = excluded.avatar_url,
           updated_at = now()
       returning *`,
      [input.id, input.email ?? null, input.displayName ?? null, input.avatarUrl ?? null]
    )

    return toProfileRow(rows[0] as Record<string, unknown>)
  }
}
