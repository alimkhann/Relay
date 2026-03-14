import type {
  AiJobRunRow,
  BootstrapPacketRow,
  ExtensionConnectGrantRow,
  ProjectStateOverrideRow,
  ProjectStateRow,
  SessionDigestRow
} from "@relay/shared"

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item !== "string") {
      return []
    }

    const normalized = item.trim()
    return normalized ? [normalized] : []
  })
}

export function toSessionDigestRow(record: Record<string, unknown>): SessionDigestRow {
  return {
    id: String(record.id),
    projectId: String(record.project_id),
    sourceSessionId: String(record.source_session_id),
    sourceSignature: String(record.source_signature),
    summaryShort: String(record.summary_short),
    structuredDigest: (record.structured_digest as Record<string, unknown>) ?? {},
    confidence: Number(record.confidence ?? 0),
    importanceScore: Number(record.importance_score ?? 0),
    needsProjectStateMerge: Boolean(record.needs_project_state_merge),
    mergedAt: record.merged_at ? String(record.merged_at) : null,
    createdBy: String(record.created_by),
    createdAt: String(record.created_at)
  }
}

export function toProjectStateRow(record: Record<string, unknown>): ProjectStateRow {
  return {
    projectId: String(record.project_id),
    projectOverview: record.project_overview ? String(record.project_overview) : null,
    currentObjective: record.current_objective ? String(record.current_objective) : null,
    stackDomain: record.stack_domain ? String(record.stack_domain) : null,
    recentProgress: record.recent_progress ? String(record.recent_progress) : null,
    decisions: toStringArray(record.decisions),
    constraints: toStringArray(record.constraints),
    openTasks: toStringArray(record.open_tasks),
    relevantTools: toStringArray(record.relevant_tools),
    lastBootstrapAt: record.last_bootstrap_at ? String(record.last_bootstrap_at) : null,
    dirty: Boolean(record.dirty),
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at)
  }
}

export function toProjectStateOverrideRow(record: Record<string, unknown>): ProjectStateOverrideRow {
  return {
    projectId: String(record.project_id),
    projectOverviewOverride: record.project_overview_override ? String(record.project_overview_override) : null,
    currentObjectiveOverride: record.current_objective_override ? String(record.current_objective_override) : null,
    recentProgressOverride: record.recent_progress_override ? String(record.recent_progress_override) : null,
    hiddenDecisions: toStringArray(record.hidden_decisions),
    hiddenConstraints: toStringArray(record.hidden_constraints),
    hiddenOpenTasks: toStringArray(record.hidden_open_tasks),
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at)
  }
}

export function toBootstrapPacketRow(record: Record<string, unknown>): BootstrapPacketRow {
  return {
    id: String(record.id),
    projectId: String(record.project_id),
    targetProfileId: String(record.target_profile_id),
    kind: record.kind as BootstrapPacketRow["kind"],
    content: String(record.content),
    structuredSnapshot: (record.structured_snapshot as Record<string, unknown>) ?? {},
    renderer: record.renderer as BootstrapPacketRow["renderer"],
    generationMetadata: (record.generation_metadata as Record<string, unknown>) ?? {},
    createdBy: String(record.created_by),
    createdAt: String(record.created_at)
  }
}

export function toAiJobRunRow(record: Record<string, unknown>): AiJobRunRow {
  return {
    id: String(record.id),
    projectId: String(record.project_id),
    sessionId: record.session_id ? String(record.session_id) : null,
    jobKind: record.job_kind as AiJobRunRow["jobKind"],
    status: record.status as AiJobRunRow["status"],
    inputPayload: (record.input_payload as Record<string, unknown>) ?? {},
    outputPayload: (record.output_payload as Record<string, unknown>) ?? {},
    primaryModel: record.primary_model ? String(record.primary_model) : null,
    actualModel: record.actual_model ? String(record.actual_model) : null,
    fallbackUsed: Boolean(record.fallback_used),
    tokenUsage: (record.token_usage as Record<string, unknown>) ?? {},
    errorClass: record.error_class ? String(record.error_class) : null,
    errorMessage: record.error_message ? String(record.error_message) : null,
    attempts: Number(record.attempts ?? 0),
    startedAt: record.started_at ? String(record.started_at) : null,
    completedAt: record.completed_at ? String(record.completed_at) : null,
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at)
  }
}

export function toExtensionConnectGrantRow(record: Record<string, unknown>): ExtensionConnectGrantRow {
  return {
    id: String(record.id),
    userId: String(record.user_id),
    deviceName: String(record.device_name),
    grantHash: String(record.grant_hash),
    grantPrefix: String(record.grant_prefix),
    apiBase: String(record.api_base),
    expiresAt: String(record.expires_at),
    consumedAt: record.consumed_at ? String(record.consumed_at) : null,
    createdAt: String(record.created_at)
  }
}
