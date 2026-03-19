import type {
  WorkSessionCheckpointRow,
  WorkSessionCheckpointWithSessionRow,
  WorkSessionEventRow,
  WorkSessionRow,
} from "@relay/shared"

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item !== "string") return []
    const normalized = item.trim()
    return normalized ? [normalized] : []
  })
}

export function toWorkSessionRow(record: Record<string, unknown>): WorkSessionRow {
  return {
    id: String(record.id),
    projectId: String(record.project_id),
    userId: String(record.user_id),
    workspaceId: record.workspace_id ? String(record.workspace_id) : null,
    surface: record.surface as WorkSessionRow["surface"],
    threadId: record.thread_id ? String(record.thread_id) : null,
    agentName: record.agent_name ? String(record.agent_name) : null,
    clientName: record.client_name ? String(record.client_name) : null,
    associationMethod: record.association_method ? String(record.association_method) : null,
    associationConfidence:
      record.association_confidence === null || record.association_confidence === undefined
        ? null
        : Number(record.association_confidence),
    baseSyncMarkAt: record.base_sync_mark_at ? String(record.base_sync_mark_at) : null,
    latestSummary: record.latest_summary ? String(record.latest_summary) : null,
    latestStructuredState: (record.latest_structured_state as Record<string, unknown>) ?? {},
    status: record.status as WorkSessionRow["status"],
    startedAt: String(record.started_at),
    endedAt: record.ended_at ? String(record.ended_at) : null,
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at),
  }
}

export function toWorkSessionEventRow(record: Record<string, unknown>): WorkSessionEventRow {
  return {
    id: String(record.id),
    workSessionId: String(record.work_session_id),
    projectId: String(record.project_id),
    userId: String(record.user_id),
    eventType: String(record.event_type),
    payload: (record.payload as Record<string, unknown>) ?? {},
    sourceSurface: record.source_surface as WorkSessionEventRow["sourceSurface"],
    sourceUrl: record.source_url ? String(record.source_url) : null,
    sourceThreadId: record.source_thread_id ? String(record.source_thread_id) : null,
    createdAt: String(record.created_at),
  }
}

export function toWorkSessionCheckpointRow(record: Record<string, unknown>): WorkSessionCheckpointRow {
  return {
    id: String(record.id),
    workSessionId: String(record.work_session_id),
    projectId: String(record.project_id),
    userId: String(record.user_id),
    summaryShort: record.summary_short ? String(record.summary_short) : null,
    structuredState: (record.structured_state as Record<string, unknown>) ?? {},
    sourceEventIds: toStringArray(record.source_event_ids),
    confidence: record.confidence === null || record.confidence === undefined ? null : Number(record.confidence),
    createdAt: String(record.created_at),
  }
}

export function toWorkSessionCheckpointWithSessionRow(
  record: Record<string, unknown>,
): WorkSessionCheckpointWithSessionRow {
  return {
    ...toWorkSessionCheckpointRow(record),
    surface: record.surface as WorkSessionCheckpointWithSessionRow["surface"],
    threadId: record.thread_id ? String(record.thread_id) : null,
    agentName: record.agent_name ? String(record.agent_name) : null,
    clientName: record.client_name ? String(record.client_name) : null,
    associationConfidence:
      record.association_confidence === null || record.association_confidence === undefined
        ? null
        : Number(record.association_confidence),
    sessionStatus: record.session_status as WorkSessionCheckpointWithSessionRow["sessionStatus"],
    sessionStartedAt: String(record.session_started_at),
    sessionEndedAt: record.session_ended_at ? String(record.session_ended_at) : null,
  }
}
