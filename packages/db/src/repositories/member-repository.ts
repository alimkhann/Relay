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
}
