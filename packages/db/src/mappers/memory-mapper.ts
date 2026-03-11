import type { ContextPacketRow, MemoryItemRow, ProjectBindingRow, TargetProfileRow, UserSettingsRow } from "@relay/shared"

export function toMemoryRow(record: Record<string, unknown>): MemoryItemRow {
  return {
    id: String(record.id),
    projectId: String(record.project_id),
    sourceTurnId: record.source_turn_id ? String(record.source_turn_id) : null,
    type: record.type as MemoryItemRow["type"],
    title: record.title ? String(record.title) : null,
    content: String(record.content),
    pinned: Boolean(record.pinned),
    isArchived: Boolean(record.is_archived),
    sortOrder: record.sort_order === null || record.sort_order === undefined ? null : Number(record.sort_order),
    metadata: (record.metadata as Record<string, unknown>) ?? {},
    createdBy: String(record.created_by),
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at)
  }
}

export function toTargetProfileRow(record: Record<string, unknown>): TargetProfileRow {
  return {
    id: String(record.id),
    key: String(record.key),
    name: String(record.name),
    platform: record.platform as TargetProfileRow["platform"],
    description: record.description ? String(record.description) : null,
    config: (record.config as Record<string, unknown>) ?? {},
    createdAt: String(record.created_at)
  }
}

export function toContextPacketRow(record: Record<string, unknown>): ContextPacketRow {
  return {
    id: String(record.id),
    projectId: String(record.project_id),
    targetProfileId: String(record.target_profile_id),
    content: String(record.content),
    sourceSnapshot: (record.source_snapshot as Record<string, unknown>) ?? {},
    createdBy: String(record.created_by),
    createdAt: String(record.created_at)
  }
}

export function toBindingRow(record: Record<string, unknown>): ProjectBindingRow {
  return {
    id: String(record.id),
    userId: String(record.user_id),
    projectId: String(record.project_id),
    bindingKind: record.binding_kind as ProjectBindingRow["bindingKind"],
    domain: record.domain ? String(record.domain) : null,
    tabId: record.tab_id ? String(record.tab_id) : null,
    platform: (record.platform as ProjectBindingRow["platform"]) ?? null,
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at)
  }
}

export function toSettingsRow(record: Record<string, unknown>): UserSettingsRow {
  return {
    userId: String(record.user_id),
    settings: (record.settings as UserSettingsRow["settings"]) ?? {
      enabledPlatforms: ["chatgpt", "perplexity", "claude", "codex"],
      defaultTargetProfileKey: "claude_code_build",
      autoCapture: true,
      showSidepanelOnSupportedSites: true
    },
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at)
  }
}
