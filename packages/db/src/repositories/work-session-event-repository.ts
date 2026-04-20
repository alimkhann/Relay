import type { WorkSessionEventRow } from "@relay/shared"

import { toWorkSessionEventRow } from "../mappers/work-session-mapper"
import type { DatabaseProvider } from "../store/provider"

export class WorkSessionEventRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async create(input: {
    workSessionId: string
    projectId: string
    userId: string
    eventType: string
    payload?: Record<string, unknown>
    sourceSurface: WorkSessionEventRow["sourceSurface"]
    sourceUrl?: string | null
    sourceThreadId?: string | null
  }): Promise<WorkSessionEventRow> {
    const rows = await this.provider.query(
      `insert into work_session_events (
         work_session_id,
         project_id,
         user_id,
         event_type,
         payload,
         source_surface,
         source_url,
         source_thread_id
       )
       values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
       returning *`,
      [
        input.workSessionId,
        input.projectId,
        input.userId,
        input.eventType,
        JSON.stringify(input.payload ?? {}),
        input.sourceSurface,
        input.sourceUrl ?? null,
        input.sourceThreadId ?? null,
      ],
    )

    return toWorkSessionEventRow(rows[0] as Record<string, unknown>)
  }

  async listRecentByProject(input: {
    projectId: string
    limit?: number
  }): Promise<WorkSessionEventRow[]> {
    const rows = await this.provider.query(
      `select *
       from work_session_events
       where project_id = $1
       order by created_at desc
       limit coalesce($2::int, 50)`,
      [input.projectId, input.limit ?? null],
    )

    return rows.map((row) => toWorkSessionEventRow(row as Record<string, unknown>))
  }
}
