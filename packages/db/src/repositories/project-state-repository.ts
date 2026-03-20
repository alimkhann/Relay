import type { ProjectStateRow } from "@relay/shared"

import { toProjectStateRow } from "../mappers/relay-v2-mapper"
import type { DatabaseProvider } from "../store/provider"
import { encryptTextIfConfigured } from "../utils/encrypted-text"

export class ProjectStateRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async getByProject(projectId: string): Promise<ProjectStateRow | null> {
    const rows = await this.provider.query(
      `select *
       from project_state
       where project_id = $1
       limit 1`,
      [projectId]
    )

    const row = rows[0]
    return row ? toProjectStateRow(row as Record<string, unknown>) : null
  }

  async upsert(input: {
    projectId: string
    projectOverview: string | null
    currentObjective: string | null
    stackDomain: string | null
    recentProgress: string | null
    decisions: string[]
    constraints: string[]
    openTasks: string[]
    relevantTools: string[]
    objectiveHistory?: ProjectStateRow["objectiveHistory"]
    dirty: boolean
    lastBootstrapAt?: string | null
  }): Promise<ProjectStateRow> {
    const rows = await this.provider.query(
      `insert into project_state (
         project_id,
         project_overview,
         current_objective,
         stack_domain,
         recent_progress,
         decisions,
         constraints,
         open_tasks,
         relevant_tools,
         objective_history,
         dirty,
         last_bootstrap_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (project_id) do update
         set project_overview = excluded.project_overview,
             current_objective = excluded.current_objective,
             stack_domain = excluded.stack_domain,
             recent_progress = excluded.recent_progress,
             decisions = excluded.decisions,
             constraints = excluded.constraints,
             open_tasks = excluded.open_tasks,
             relevant_tools = excluded.relevant_tools,
             objective_history = excluded.objective_history,
             dirty = excluded.dirty,
             last_bootstrap_at = coalesce(excluded.last_bootstrap_at, project_state.last_bootstrap_at),
             updated_at = now()
       returning *`,
      [
        input.projectId,
        input.projectOverview ? encryptTextIfConfigured(input.projectOverview) : null,
        input.currentObjective ? encryptTextIfConfigured(input.currentObjective) : null,
        input.stackDomain ? encryptTextIfConfigured(input.stackDomain) : null,
        input.recentProgress ? encryptTextIfConfigured(input.recentProgress) : null,
        encryptTextIfConfigured(JSON.stringify(input.decisions)),
        encryptTextIfConfigured(JSON.stringify(input.constraints)),
        encryptTextIfConfigured(JSON.stringify(input.openTasks)),
        encryptTextIfConfigured(JSON.stringify(input.relevantTools)),
        encryptTextIfConfigured(JSON.stringify(input.objectiveHistory ?? [])),
        input.dirty,
        input.lastBootstrapAt ?? null
      ]
    )

    return toProjectStateRow(rows[0] as Record<string, unknown>)
  }

  async markBootstrapped(projectId: string): Promise<void> {
    await this.provider.query(
      `update project_state
       set dirty = false,
           last_bootstrap_at = now(),
           updated_at = now()
       where project_id = $1`,
      [projectId]
    )
  }

  async clear(projectId: string): Promise<void> {
    await this.provider.query(
      `delete from project_state
       where project_id = $1`,
      [projectId]
    )
  }
}
