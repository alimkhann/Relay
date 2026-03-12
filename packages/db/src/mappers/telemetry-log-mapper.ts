import type { TelemetryLogRow } from "@relay/shared"

export function toTelemetryLogRow(record: Record<string, unknown>): TelemetryLogRow {
  return {
    id: String(record.id),
    level: String(record.level) as TelemetryLogRow["level"],
    surface: String(record.surface) as TelemetryLogRow["surface"],
    area: String(record.area),
    event: String(record.event),
    message: String(record.message),
    requestId: record.request_id ? String(record.request_id) : null,
    flowId: record.flow_id ? String(record.flow_id) : null,
    userId: record.user_id ? String(record.user_id) : null,
    projectId: record.project_id ? String(record.project_id) : null,
    sessionId: record.session_id ? String(record.session_id) : null,
    tabId: typeof record.tab_id === "number" ? record.tab_id : record.tab_id ? Number(record.tab_id) : null,
    url: record.url ? String(record.url) : null,
    context:
      record.context && typeof record.context === "object"
        ? (record.context as Record<string, unknown>)
        : {},
    error:
      record.error && typeof record.error === "object"
        ? (record.error as TelemetryLogRow["error"])
        : null,
    createdAt: String(record.created_at)
  }
}
