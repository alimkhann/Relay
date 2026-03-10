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
}
