import type { DatabaseProvider } from "../store/provider"

export class MemberRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async ensureOwner(projectId: string, userId: string): Promise<void> {
    await this.provider.query(
      `insert into project_members (project_id, user_id, role)
       values ($1, $2, 'owner')
       on conflict (project_id, user_id) do update
       set role = excluded.role`,
      [projectId, userId]
    )
  }

  /**
   * Explicit app-level membership check. Required for cross-tenant write
   * surfaces (e.g. multi-project session links) because production connects as
   * the table owner, which bypasses RLS — so RLS alone is not enforcement.
   */
  async isMember(projectId: string, userId: string): Promise<boolean> {
    const rows = await this.provider.query(
      `select 1
       from project_members
       where project_id = $1 and user_id = $2
       limit 1`,
      [projectId, userId]
    )
    return rows.length > 0
  }

  /** Filter the input ids down to projects the user is actually a member of. */
  async filterMemberProjectIds(projectIds: string[], userId: string): Promise<string[]> {
    const unique = Array.from(new Set(projectIds.filter(Boolean)))
    if (unique.length === 0) return []
    const rows = await this.provider.query(
      `select project_id
       from project_members
       where user_id = $1 and project_id = any($2::uuid[])`,
      [userId, unique]
    )
    return rows.map((row) => String((row as Record<string, unknown>).project_id))
  }
}
