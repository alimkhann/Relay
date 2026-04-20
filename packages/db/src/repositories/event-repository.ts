import type { CaptureEventRow } from "@relay/shared"

import type { DatabaseProvider } from "../store/provider"

export class EventRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async log(input: Omit<CaptureEventRow, "id" | "createdAt">): Promise<void> {
    await this.provider.query(
      `insert into capture_events (user_id, project_id, session_id, event_type, payload)
       values ($1, $2, $3, $4, $5::jsonb)`,
      [input.userId, input.projectId, input.sessionId, input.eventType, JSON.stringify(input.payload)]
    )
  }

  async listRecentByProject(input: {
    projectId: string
    limit?: number
  }): Promise<CaptureEventRow[]> {
    const rows = await this.provider.query(
      `select *
       from capture_events
       where project_id = $1
       order by created_at desc
       limit coalesce($2::int, 50)`,
      [input.projectId, input.limit ?? null],
    )

    return rows.map((row) => {
      const record = row as Record<string, unknown>
      return {
        id: String(record.id),
        userId: String(record.user_id),
        projectId: record.project_id ? String(record.project_id) : null,
        sessionId: record.session_id ? String(record.session_id) : null,
        eventType: String(record.event_type),
        payload: (record.payload as Record<string, unknown> | null) ?? {},
        createdAt: String(record.created_at),
      }
    })
  }
}
