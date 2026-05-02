import type { MemoryEventRow, MemoryEventType } from "@relay/shared"

import { toMemoryEventRow } from "../mappers/memory-event-mapper"
import type { DatabaseProvider } from "../store/provider"

export class MemoryEventRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async create(input: {
    projectId: string
    memoryItemId?: string | null
    eventType: MemoryEventType
    sourceSurface?: string | null
    userId?: string | null
    payload?: Record<string, unknown>
  }): Promise<MemoryEventRow> {
    const rows = await this.provider.query(
      `insert into memory_events (
         project_id,
         memory_item_id,
         event_type,
         source_surface,
         user_id,
         payload
       )
       values ($1, $2, $3, $4, $5, $6::jsonb)
       returning *`,
      [
        input.projectId,
        input.memoryItemId ?? null,
        input.eventType,
        input.sourceSurface ?? null,
        input.userId ?? null,
        JSON.stringify(input.payload ?? {}),
      ],
    )

    return toMemoryEventRow(rows[0] as Record<string, unknown>)
  }

  async listRecentForProject(input: {
    projectId: string
    since?: string | null
    eventTypes?: MemoryEventType[]
    limit?: number
  }): Promise<MemoryEventRow[]> {
    const rows = await this.provider.query(
      `select *
       from memory_events
       where project_id = $1
         and ($2::timestamptz is null or created_at >= $2::timestamptz)
         and ($3::text[] is null or event_type = ANY($3::text[]))
       order by created_at desc
       limit coalesce($4::int, 200)`,
      [
        input.projectId,
        input.since ?? null,
        input.eventTypes ?? null,
        input.limit ?? null,
      ],
    )

    return rows.map((row) => toMemoryEventRow(row as Record<string, unknown>))
  }
}
