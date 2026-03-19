import type { WorkSessionCheckpointRow, WorkSessionCheckpointWithSessionRow } from "@relay/shared"

import {
  toWorkSessionCheckpointRow,
  toWorkSessionCheckpointWithSessionRow,
} from "../mappers/work-session-mapper"
import type { DatabaseProvider } from "../store/provider"

export class WorkSessionCheckpointRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async create(input: {
    workSessionId: string
    projectId: string
    userId: string
    summaryShort?: string | null
    structuredState: Record<string, unknown>
    sourceEventIds?: string[]
    confidence?: number | null
  }): Promise<WorkSessionCheckpointRow> {
    const rows = await this.provider.query(
      `insert into work_session_checkpoints (
         work_session_id,
         project_id,
         user_id,
         summary_short,
         structured_state,
         source_event_ids,
         confidence
       )
       values ($1, $2, $3, $4, $5::jsonb, $6::text[], $7)
       returning *`,
      [
        input.workSessionId,
        input.projectId,
        input.userId,
        input.summaryShort ?? null,
        JSON.stringify(input.structuredState),
        input.sourceEventIds ?? [],
        input.confidence ?? null,
      ],
    )

    return toWorkSessionCheckpointRow(rows[0] as Record<string, unknown>)
  }

  async listRecentByProject(
    projectId: string,
    input: { since?: string; limit?: number; surfaces?: string[] } = {},
  ): Promise<WorkSessionCheckpointWithSessionRow[]> {
    const rows = await this.provider.query(
      `select
         checkpoints.*,
         sessions.surface,
         sessions.thread_id,
         sessions.agent_name,
         sessions.client_name,
         sessions.association_confidence,
         sessions.status as session_status,
         sessions.started_at as session_started_at,
         sessions.ended_at as session_ended_at
       from work_session_checkpoints checkpoints
       join work_sessions sessions on sessions.id = checkpoints.work_session_id
       where checkpoints.project_id = $1
         and ($2::timestamptz is null or checkpoints.created_at >= $2::timestamptz)
         and ($3::text[] is null or sessions.surface = any($3::text[]))
       order by checkpoints.created_at desc
       limit $4`,
      [projectId, input.since ?? null, input.surfaces?.length ? input.surfaces : null, input.limit ?? 8],
    )

    return rows.map((row) =>
      toWorkSessionCheckpointWithSessionRow(row as Record<string, unknown>),
    )
  }
}
