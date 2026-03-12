import type { TelemetryEventInput, TelemetryLogRow, TelemetrySurface } from "@relay/shared"

import { toTelemetryLogRow } from "../mappers/telemetry-log-mapper"
import type { DatabaseProvider } from "../store/provider"

export interface TelemetryLogFilters {
  level?: TelemetryLogRow["level"]
  surface?: TelemetrySurface
  requestId?: string
  flowId?: string
  userId?: string
  projectId?: string
  since?: string
  until?: string
  limit?: number
}

export class TelemetryLogRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async createMany(logs: TelemetryEventInput[]): Promise<void> {
    if (logs.length === 0) return

    const values: unknown[] = []
    const tuples = logs.map((log, index) => {
      const offset = index * 15
      values.push(
        log.timestamp ?? new Date().toISOString(),
        log.level,
        log.surface,
        log.area,
        log.event,
        log.message,
        log.requestId ?? null,
        log.flowId ?? null,
        log.userId ?? null,
        log.projectId ?? null,
        log.sessionId ?? null,
        log.tabId ?? null,
        log.url ?? null,
        JSON.stringify(log.context ?? {}),
        log.error ? JSON.stringify(log.error) : null
      )

      return `($${offset + 1}::timestamptz, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}::jsonb, $${offset + 15}::jsonb)`
    })

    await this.provider.query(
      `insert into telemetry_logs (
         created_at,
         level,
         surface,
         area,
         event,
         message,
         request_id,
         flow_id,
         user_id,
         project_id,
         session_id,
         tab_id,
         url,
         context,
         error
       )
       values ${tuples.join(", ")}`,
      values
    )
  }

  async list(filters: TelemetryLogFilters = {}): Promise<TelemetryLogRow[]> {
    const values: unknown[] = []
    const where: string[] = []

    if (filters.level) {
      values.push(filters.level)
      where.push(`level = $${values.length}`)
    }

    if (filters.surface) {
      values.push(filters.surface)
      where.push(`surface = $${values.length}`)
    }

    if (filters.requestId) {
      values.push(filters.requestId)
      where.push(`request_id = $${values.length}`)
    }

    if (filters.flowId) {
      values.push(filters.flowId)
      where.push(`flow_id = $${values.length}`)
    }

    if (filters.userId) {
      values.push(filters.userId)
      where.push(`user_id = $${values.length}`)
    }

    if (filters.projectId) {
      values.push(filters.projectId)
      where.push(`project_id = $${values.length}`)
    }

    if (filters.since) {
      values.push(filters.since)
      where.push(`created_at >= $${values.length}::timestamptz`)
    }

    if (filters.until) {
      values.push(filters.until)
      where.push(`created_at <= $${values.length}::timestamptz`)
    }

    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 200)
    values.push(limit)

    const rows = await this.provider.query(
      `select *
       from telemetry_logs
       ${where.length > 0 ? `where ${where.join(" and ")}` : ""}
       order by created_at desc
       limit $${values.length}`,
      values
    )

    return rows.map((row) => toTelemetryLogRow(row as Record<string, unknown>))
  }

  async cleanupOlderThan(days: number): Promise<void> {
    await this.provider.query(
      `delete from telemetry_logs
       where created_at < now() - ($1 * interval '1 day')`,
      [days]
    )
  }
}
