import type { ProjectStateOverrideRow } from "@relay/shared"

import { toProjectStateOverrideRow } from "../mappers/relay-v2-mapper"
import type { DatabaseProvider } from "../store/provider"

export class ProjectStateOverrideRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async getByProject(projectId: string): Promise<ProjectStateOverrideRow | null> {
    const rows = await this.provider.query(
      `select *
       from project_state_overrides
       where project_id = $1
       limit 1`,
      [projectId]
    )

    const row = rows[0]
    return row ? toProjectStateOverrideRow(row as Record<string, unknown>) : null
  }

  async upsert(input: {
    projectId: string
    projectOverviewOverride?: string | null
    replaceProjectOverviewOverride?: boolean
    currentObjectiveOverride?: string | null
    replaceCurrentObjectiveOverride?: boolean
    recentProgressOverride?: string | null
    replaceRecentProgressOverride?: boolean
    hiddenDecisions?: string[]
    hiddenConstraints?: string[]
    hiddenOpenTasks?: string[]
  }): Promise<ProjectStateOverrideRow> {
    const rows = await this.provider.query(
      `insert into project_state_overrides (
         project_id,
         project_overview_override,
         current_objective_override,
         recent_progress_override,
         hidden_decisions,
         hidden_constraints,
         hidden_open_tasks
       )
       values (
         $1, $2, $3, $4,
         coalesce($5::jsonb, '[]'::jsonb),
         coalesce($6::jsonb, '[]'::jsonb),
         coalesce($7::jsonb, '[]'::jsonb)
       )
       on conflict (project_id) do update
         set project_overview_override = case when $8::boolean then $2 else project_state_overrides.project_overview_override end,
             current_objective_override = case when $9::boolean then $3 else project_state_overrides.current_objective_override end,
             recent_progress_override = case when $10::boolean then $4 else project_state_overrides.recent_progress_override end,
             hidden_decisions = coalesce($5::jsonb, project_state_overrides.hidden_decisions),
             hidden_constraints = coalesce($6::jsonb, project_state_overrides.hidden_constraints),
             hidden_open_tasks = coalesce($7::jsonb, project_state_overrides.hidden_open_tasks),
             updated_at = now()
       returning *`,
      [
        input.projectId,
        input.projectOverviewOverride ?? null,
        input.currentObjectiveOverride ?? null,
        input.recentProgressOverride ?? null,
        input.hiddenDecisions ? JSON.stringify(input.hiddenDecisions) : null,
        input.hiddenConstraints ? JSON.stringify(input.hiddenConstraints) : null,
        input.hiddenOpenTasks ? JSON.stringify(input.hiddenOpenTasks) : null,
        Boolean(input.replaceProjectOverviewOverride),
        Boolean(input.replaceCurrentObjectiveOverride),
        Boolean(input.replaceRecentProgressOverride)
      ]
    )

    return toProjectStateOverrideRow(rows[0] as Record<string, unknown>)
  }
}
