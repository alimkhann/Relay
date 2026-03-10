import type { CaptureEventRow } from "@relay/shared"
import { isoNow } from "@relay/shared"

import type { DatabaseProvider } from "../store/provider"

export class EventRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async log(input: Omit<CaptureEventRow, "id" | "createdAt">): Promise<void> {
    if (this.provider.mode === "memory") {
      this.provider.store.captureEvents.unshift({
        id: crypto.randomUUID(),
        createdAt: isoNow(),
        ...input
      })
      return
    }

    const { error } = await this.provider.client.from("capture_events").insert({
      user_id: input.userId,
      project_id: input.projectId,
      session_id: input.sessionId,
      event_type: input.eventType,
      payload: input.payload
    })

    if (error) throw error
  }
}
