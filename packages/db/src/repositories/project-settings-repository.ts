import type { ProjectSettingsRow } from "@relay/shared"

import { toProjectSettingsRow } from "../mappers/memory-mapper"
import type { DatabaseProvider } from "../store/provider"

export class ProjectSettingsRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async getByProject(projectId: string): Promise<ProjectSettingsRow | null> {
    const rows = await this.provider.query(
      `select * from project_settings where project_id = $1 limit 1`,
      [projectId],
    )
    const row = rows[0]
    return row ? toProjectSettingsRow(row as Record<string, unknown>) : null
  }

  async upsert(projectId: string, settings: ProjectSettingsRow["settings"]): Promise<ProjectSettingsRow> {
    const rows = await this.provider.query(
      `insert into project_settings (project_id, settings)
       values ($1, $2::jsonb)
       on conflict (project_id) do update
       set settings = excluded.settings,
           updated_at = now()
       returning *`,
      [projectId, JSON.stringify(settings)],
    )

    return toProjectSettingsRow(rows[0] as Record<string, unknown>)
  }
}
