export const canonEntryKinds = [
  "objective",
  "decision",
  "constraint",
  "task",
  "progress",
  "artifact",
  "architecture_fact",
  "risk",
  "assumption",
  "question",
] as const

export const canonEntryStatuses = [
  "active",
  "tentative",
  "superseded",
  "disputed",
  "stale",
  "resolved",
] as const

export const canonEvidenceSourceKinds = [
  "memory_item",
  "source_turn",
  "session_digest",
  "work_session",
  "artifact",
  "url",
  "manual",
] as const

export const projectSummarySnapshotKinds = [
  "session_summary",
  "project_summary",
  "current_focus_summary",
] as const
