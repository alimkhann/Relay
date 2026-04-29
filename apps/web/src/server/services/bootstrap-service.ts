import { createRepositoryBundle } from "@relay/db"
import type {
  AiJobRunRow,
  BootstrapPacketDto,
  BootstrapRequest,
  BootstrapPacketRow,
  CanonEntryRow,
  MemoryItemRow,
  ProjectRow,
  ProjectStateRow,
  ProjectStateStatusDto,
  ProjectSummarySnapshotRow,
  SessionDigestRow,
  SourceSessionRow,
  TargetProfileRow,
  WorkSessionCheckpointWithSessionRow,
} from "@relay/shared"
import { bootstrapRequestSchema, buildEffectiveProjectState, computeDecayScore, DECAY_VISIBILITY_THRESHOLD, hashContent, mergeGovernedList, normalizeText } from "@relay/shared"

import { NotFoundError } from "@/server/http/errors"
import { buildBootstrapCanonView } from "./canon-autonomy-service"
import { logServerEvent } from "@/server/logging/logger"
import { emitAiRequestCompleted } from "./ai-analytics-service"
import { drainDigestJobsForProject } from "./digest-service"
import { resolveViewerEntitlements } from "./entitlement-service"
import { GEMINI_MODELS, runGeminiJsonWithFallback } from "./gemini-service"
import { getProjectStateStatus } from "./state-status-service"
import { fireUserMilestone } from "./user-milestones-service"
import { stripArrowNotation, truncateSentence, escapeMarkdownInline } from "@relay/shared"

interface BootstrapCanonContext {
  tentativeEntries: CanonEntryRow[]
  latestProjectSummary: string | null
  latestCurrentFocusSummary: string | null
}

interface BootstrapProjectSettingsContext {
  includeTentativeUpdatesInPackets: boolean
}

type PacketMode = "chat_new" | "chat_continue" | "chat_smart_delta" | "agent_quick_continuity" | "agent_full_bootstrap"

interface BootstrapGenerationReady {
  status: "ready"
  packet: BootstrapPacketRow
  reason: null
  resolvedTargetProfileKey: string
  stateStatus: ProjectStateStatusDto
}

interface BootstrapGenerationPending {
  status: "pending"
  packet: null
  reason: string
  resolvedTargetProfileKey: string
  stateStatus: ProjectStateStatusDto
}

export type BootstrapGenerationResult = BootstrapGenerationReady | BootstrapGenerationPending

interface BootstrapModelShape {
  projectOverview: string | null
  currentObjective: string | null
  recentProgress: string | null
  decisions: string[]
  constraints: string[]
  openTasks: string[]
  relevantTools: string[]
  firstAction: string | null
}

function inferPacketMode(profile: TargetProfileRow, kind: BootstrapRequest["kind"], requested?: PacketMode): PacketMode {
  if (requested) return requested

  const isAgent = profile.platform === "claude_code" || profile.platform === "codex"
  if (isAgent) {
    return kind === "quick_continuity" ? "agent_quick_continuity" : "agent_full_bootstrap"
  }

  return kind === "quick_continuity" ? "chat_continue" : "chat_new"
}

function trimList(items: string[], limit: number) {
  return items.slice(0, limit)
}

function resolveReadMode(input: { deep?: boolean; packetMode: PacketMode }) {
  if (input.deep) return "deep" as const
  if (input.packetMode === "agent_full_bootstrap") return "deep" as const
  return "basic" as const
}

function resolveBootstrapModelConfig(input: {
  plan: "free" | "starter" | "pro"
  packetMode: PacketMode
  preferredRenderer: BootstrapPacketRow["renderer"]
}) {
  if (input.preferredRenderer !== "gemini") {
    return {
      renderer: "deterministic" as const,
      primaryModel: "deterministic",
      fallbackModel: "deterministic",
    }
  }

  if (input.plan === "pro") {
    return {
      renderer: "gemini" as const,
      primaryModel: GEMINI_MODELS.bootstrap.primary,
      fallbackModel: GEMINI_MODELS.bootstrap.fallback,
    }
  }

  if (input.plan === "starter") {
    return {
      renderer: "gemini" as const,
      primaryModel: GEMINI_MODELS.bootstrap.fallback,
      fallbackModel: GEMINI_MODELS.digest.fallback,
    }
  }

  return {
    renderer: "deterministic" as const,
    primaryModel: "deterministic",
    fallbackModel: "deterministic",
  }
}

interface DigestSnapshotShape {
  projectOverviewDelta: string | null
  currentObjectiveDelta: string | null
  recentProgressDelta: string | null
  newDecisions: string[]
  newConstraints: string[]
  newTasks: string[]
  relevantToolsDelta: string[]
}

function isLowSignalDigestSummary(summary: string) {
  const normalized = normalizeText(summary).toLowerCase()
  if (!normalized) return true
  if (normalized.length < 40) return true
  if (normalized.includes("what's better") || normalized.includes("whats better")) return true
  return normalized.startsWith("chatgpt said:thought for")
}

function sanitizeFirstAction(value: string | null | undefined, state: ProjectStateRow | null) {
  const normalized = value ? truncateSentence(normalizeText(value), 260) : ""

  if (
    !normalized ||
    /^(insert (bootstrap|project brief)|pin selection|save to project|connect relay|open settings|open project)$/i.test(normalized)
  ) {
    return state?.openTasks[0] ?? "Review the project state and continue from the highest-priority open task."
  }

  return normalized
}

function inferRenderer(parsed: BootstrapRequest, state: ProjectStateRow | null) {
  if (parsed.kind === "quick_continuity") {
    return "deterministic" as const
  }

  if (parsed.deep) {
    return "gemini" as const
  }

  return state?.dirty ? "gemini" : "deterministic"
}

function sanitizeList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => normalizeText(String(item))).filter(Boolean).slice(0, 8)
    : []
}

function mergeUnique(base: string[], extra: string[]) {
  const seen = new Set(base.map((item) => item.toLowerCase()))
  const merged = [...base]

  for (const item of extra) {
    const normalized = normalizeText(item)
    if (!normalized) continue

    const key = normalized.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(normalized)
    }
  }

  return merged
}

function readDigestSnapshot(digest: SessionDigestRow | undefined): DigestSnapshotShape {
  const payload = digest?.structuredDigest ?? {}

  return {
    projectOverviewDelta: payload.projectOverviewDelta ? truncateSentence(normalizeText(String(payload.projectOverviewDelta)), 500) : null,
    currentObjectiveDelta: payload.currentObjectiveDelta ? truncateSentence(normalizeText(String(payload.currentObjectiveDelta)), 320) : null,
    recentProgressDelta: payload.recentProgressDelta ? truncateSentence(normalizeText(String(payload.recentProgressDelta)), 500) : null,
    newDecisions: sanitizeList(payload.newDecisions),
    newConstraints: sanitizeList(payload.newConstraints),
    newTasks: sanitizeList(payload.newTasks),
    relevantToolsDelta: sanitizeList(payload.relevantToolsDelta)
  }
}

function isDigestNewerThanState(digest: SessionDigestRow | undefined, state: ProjectStateRow | null) {
  if (!digest) return false
  if (!state?.updatedAt) return true

  return new Date(digest.createdAt).getTime() > new Date(state.updatedAt).getTime()
}

export function shouldReuseLatestBootstrapPacket(input: {
  latestCreatedAt: string | null
  latestDigestCreatedAt: string | null
  stateDirty: boolean
  deep: boolean
  hasPendingCapture?: boolean
  latestInputHash?: string | null
  currentInputHash?: string | null
}) {
  if (input.hasPendingCapture) {
    return false
  }

  if (input.latestInputHash && input.currentInputHash) {
    return input.latestInputHash === input.currentInputHash
  }

  if (input.deep || input.stateDirty || !input.latestCreatedAt) {
    return false
  }

  if (!input.latestDigestCreatedAt) {
    return true
  }

  return new Date(input.latestCreatedAt).getTime() >= new Date(input.latestDigestCreatedAt).getTime()
}

function sanitizeBootstrapShape(input: BootstrapModelShape, state: ProjectStateRow | null): BootstrapModelShape {
  const decisions = sanitizeList(input.decisions)
  const constraints = sanitizeList(input.constraints)
  const openTasks = sanitizeList(input.openTasks)
  const relevantTools = sanitizeList(input.relevantTools)

  return {
    projectOverview: input.projectOverview ? truncateSentence(normalizeText(input.projectOverview), 500) : state?.projectOverview ?? null,
    currentObjective: input.currentObjective ? truncateSentence(normalizeText(input.currentObjective), 320) : state?.currentObjective ?? null,
    recentProgress: input.recentProgress ? truncateSentence(normalizeText(input.recentProgress), 500) : state?.recentProgress ?? null,
    decisions: decisions.length ? decisions : state?.decisions ?? [],
    constraints: constraints.length ? constraints : state?.constraints ?? [],
    openTasks: openTasks.length ? openTasks : state?.openTasks ?? [],
    relevantTools: relevantTools.length ? relevantTools : state?.relevantTools ?? [],
    firstAction: sanitizeFirstAction(input.firstAction, state)
  }
}

export function computeBootstrapInputHash(input: {
  project: ProjectRow
  state: ProjectStateRow | null
  digests: SessionDigestRow[]
  profile: TargetProfileRow
  kind: BootstrapRequest["kind"]
  packetMode?: PacketMode
  since?: string
  memoryItemCount?: number
  memoryLatestUpdatedAt?: string | null
  canonEntries?: CanonEntryRow[]
  summarySnapshots?: ProjectSummarySnapshotRow[]
}) {
  return hashContent(
    JSON.stringify({
      kind: input.kind,
      packetMode: input.packetMode ?? null,
      since: input.since ?? null,
      profileKey: input.profile.key,
      projectDescription: input.project.description ?? null,
      state: input.state
        ? {
            projectOverview: input.state.projectOverview,
            currentObjective: input.state.currentObjective,
            recentProgress: input.state.recentProgress,
            decisions: input.state.decisions,
            constraints: input.state.constraints,
            openTasks: input.state.openTasks,
            relevantTools: input.state.relevantTools,
            updatedAt: input.state.updatedAt,
          }
        : null,
      digests: input.digests.slice(0, 6).map((digest) => ({
        id: digest.id,
        createdAt: digest.createdAt,
        summaryShort: digest.summaryShort,
        structuredDigest: digest.structuredDigest,
      })),
      canonEntries: (input.canonEntries ?? []).slice(0, 16).map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        status: entry.status,
        content: entry.content,
        updatedAt: entry.updatedAt,
      })),
      summarySnapshots: (input.summarySnapshots ?? []).slice(0, 6).map((snapshot) => ({
        id: snapshot.id,
        kind: snapshot.kind,
        content: snapshot.content,
        createdAt: snapshot.createdAt,
      })),
      memoryItemCount: input.memoryItemCount ?? 0,
      memoryLatestUpdatedAt: input.memoryLatestUpdatedAt ?? null,
    })
  )
}

export function deterministicBootstrap(state: ProjectStateRow | null, digests: SessionDigestRow[], profile: TargetProfileRow, kind: BootstrapRequest["kind"]): BootstrapModelShape {
  const latestDigest = digests[0]
  const recentSummary = latestDigest?.summaryShort ?? null
  const digestSnapshot = readDigestSnapshot(latestDigest)
  const digestIsNewer = isDigestNewerThanState(latestDigest, state)
  const digestCurrentObjective = digestIsNewer ? digestSnapshot.currentObjectiveDelta : null
  const digestRecentProgress = digestIsNewer ? digestSnapshot.recentProgressDelta ?? recentSummary : recentSummary
  const digestProjectOverview = digestIsNewer ? digestSnapshot.projectOverviewDelta ?? recentSummary : recentSummary
  const decisions = digestIsNewer ? mergeUnique(state?.decisions ?? [], digestSnapshot.newDecisions) : state?.decisions ?? []
  const constraints = digestIsNewer ? mergeUnique(state?.constraints ?? [], digestSnapshot.newConstraints) : state?.constraints ?? []
  const openTasks = digestIsNewer ? mergeUnique(state?.openTasks ?? [], digestSnapshot.newTasks) : state?.openTasks ?? []
  const relevantTools = digestIsNewer
    ? mergeUnique(state?.relevantTools ?? [], digestSnapshot.relevantToolsDelta)
    : state?.relevantTools ?? []

  return {
    projectOverview: (state?.projectOverview ? stripArrowNotation(state.projectOverview) : null) ?? digestProjectOverview ?? "Project context is available and ready to carry forward.",
    currentObjective: digestCurrentObjective ?? (state?.currentObjective ? stripArrowNotation(state.currentObjective) : null) ?? recentSummary ?? "Continue the current project thread.",
    recentProgress:
      kind === "fresh_chat_bootstrap"
        ? (digestIsNewer ? digestRecentProgress : null) ?? state?.recentProgress ?? recentSummary ?? null
        : recentSummary ?? state?.recentProgress ?? null,
    decisions,
    constraints,
    openTasks,
    relevantTools: relevantTools.length ? relevantTools : [profile.name],
    firstAction:
      profile.key === "perplexity_research"
        ? "Start by validating the current objective, then collect the missing facts before answering."
        : "Restate the task briefly, inspect the most relevant project context, and continue from the open tasks."
  }
}

function appendListSection(lines: string[], title: string, items: string[]) {
  if (!items.length) return
  lines.push(`## ${title}`)
  lines.push(...items.map((item) => `- ${escapeMarkdownInline(item)}`))
  lines.push("")
}

function appendTextSection(lines: string[], title: string, value: string | null | undefined) {
  if (!value) return
  lines.push(`## ${title}`)
  lines.push(escapeMarkdownInline(value))
  lines.push("")
}

function formatAge(updatedAt: string): string | null {
  const ageMs = Date.now() - new Date(updatedAt).getTime()
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24))
  if (ageDays >= 14) return "(stale?)"
  if (ageDays >= 7) return `(${ageDays}d ago)`
  return null
}

function filterRelevantNotes(memoryItems: MemoryItemRow[]): MemoryItemRow[] {
  return memoryItems
    .filter((item) => {
      if (!["note", "requirement", "artifact"].includes(item.type)) return false
      if (item.metadata?.source === "mcp" && item.title === "IDE Session Summary") return false
      const score = computeDecayScore(item.type, item.updatedAt, item.lastReaffirmedAt, item.pinned)
      return score >= DECAY_VISIBILITY_THRESHOLD
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      const sa = computeDecayScore(a.type, a.updatedAt, a.lastReaffirmedAt, a.pinned)
      const sb = computeDecayScore(b.type, b.updatedAt, b.lastReaffirmedAt, b.pinned)
      return sb - sa
    })
    .slice(0, 8)
}

function normalizeCheckpointText(value: unknown) {
  if (typeof value !== "string") return null
  const normalized = normalizeText(value)
  return normalized ? truncateSentence(normalized, 320) : null
}

function normalizeCheckpointList(value: unknown, limit = 8) {
  return Array.isArray(value)
    ? value.map((item) => normalizeText(String(item))).filter(Boolean).slice(0, limit)
    : []
}

function workSessionCheckpointToMemoryDtos(checkpoints: WorkSessionCheckpointWithSessionRow[]): MemoryItemRow[] {
  const items: MemoryItemRow[] = []

  for (const checkpoint of checkpoints) {
    const state = checkpoint.structuredState ?? {}
    const confidence = checkpoint.confidence ?? 0.55
    const sessionImportance =
      normalizeCheckpointList(state.decisions).length * 12 +
      normalizeCheckpointList(state.constraints).length * 10 +
      normalizeCheckpointList(state.nextSteps).length * 8 +
      (normalizeCheckpointText(state.progress) ? 10 : 0) +
      (normalizeCheckpointText(state.summary) ? 8 : 0)
    const metadata = {
      authority: confidence >= 0.9 ? "validated_state" : "work_session",
      durability: checkpoint.sessionStatus === "closed" ? "durable" : "working",
      validationState: confidence >= 0.9 ? "validated" : "inferred",
      workSessionFinalized: checkpoint.sessionStatus === "closed",
      sessionImportance,
      reaffirmedCount: normalizeCheckpointList(state.reaffirmedFacts).length,
      agentName: checkpoint.agentName,
      clientName: checkpoint.clientName,
      workSessionId: checkpoint.workSessionId,
      evidenceKind: "source-backed",
    }

    const progress = normalizeCheckpointText(state.progress) ?? normalizeCheckpointText(state.summary)
    if (progress) {
      items.push({
        id: `${checkpoint.id}:progress`,
        projectId: checkpoint.projectId,
        sourceTurnId: null,
        type: "note",
        title: checkpoint.agentName ? `${checkpoint.agentName} session` : "IDE Session",
        content: progress,
        pinned: false,
        isArchived: false,
        sortOrder: null,
        tags: [],
        updatedAt: checkpoint.createdAt,
        metadata,
        createdBy: checkpoint.userId,
        createdAt: checkpoint.createdAt,
        sourceSurface: checkpoint.surface === "mcp" || checkpoint.surface === "cli" ? "mcp" : null,
        sourceConversationId: checkpoint.threadId,
        sourceUrl: null,
        capturedAt: checkpoint.createdAt,
        derivedFrom: checkpoint.sourceEventIds,
        embedding: null,
        embeddingModel: null,
        forgetAfter: null,
        lastReaffirmedAt: null,
      })
    }

    for (const decision of normalizeCheckpointList(state.decisions)) {
      items.push({
        id: `${checkpoint.id}:decision:${hashContent(decision).slice(0, 8)}`,
        projectId: checkpoint.projectId,
        sourceTurnId: null,
        type: "decision",
        title: null,
        content: decision,
        pinned: false,
        isArchived: false,
        sortOrder: null,
        tags: [],
        updatedAt: checkpoint.createdAt,
        metadata,
        createdBy: checkpoint.userId,
        createdAt: checkpoint.createdAt,
        sourceSurface: checkpoint.surface === "mcp" || checkpoint.surface === "cli" ? "mcp" : null,
        sourceConversationId: checkpoint.threadId,
        sourceUrl: null,
        capturedAt: checkpoint.createdAt,
        derivedFrom: checkpoint.sourceEventIds,
        embedding: null,
        embeddingModel: null,
        forgetAfter: null,
        lastReaffirmedAt: null,
      })
    }

    for (const constraint of normalizeCheckpointList(state.constraints)) {
      items.push({
        id: `${checkpoint.id}:constraint:${hashContent(constraint).slice(0, 8)}`,
        projectId: checkpoint.projectId,
        sourceTurnId: null,
        type: "constraint",
        title: null,
        content: constraint,
        pinned: false,
        isArchived: false,
        sortOrder: null,
        tags: [],
        updatedAt: checkpoint.createdAt,
        metadata,
        createdBy: checkpoint.userId,
        createdAt: checkpoint.createdAt,
        sourceSurface: checkpoint.surface === "mcp" || checkpoint.surface === "cli" ? "mcp" : null,
        sourceConversationId: checkpoint.threadId,
        sourceUrl: null,
        capturedAt: checkpoint.createdAt,
        derivedFrom: checkpoint.sourceEventIds,
        embedding: null,
        embeddingModel: null,
        forgetAfter: null,
        lastReaffirmedAt: null,
      })
    }

    for (const task of normalizeCheckpointList(state.nextSteps)) {
      items.push({
        id: `${checkpoint.id}:task:${hashContent(task).slice(0, 8)}`,
        projectId: checkpoint.projectId,
        sourceTurnId: null,
        type: "task",
        title: null,
        content: task,
        pinned: false,
        isArchived: false,
        sortOrder: null,
        tags: [],
        updatedAt: checkpoint.createdAt,
        metadata,
        createdBy: checkpoint.userId,
        createdAt: checkpoint.createdAt,
        sourceSurface: checkpoint.surface === "mcp" || checkpoint.surface === "cli" ? "mcp" : null,
        sourceConversationId: checkpoint.threadId,
        sourceUrl: null,
        capturedAt: checkpoint.createdAt,
        derivedFrom: checkpoint.sourceEventIds,
        embedding: null,
        embeddingModel: null,
        forgetAfter: null,
        lastReaffirmedAt: null,
      })
    }

    for (const note of normalizeCheckpointList(state.notes, 4)) {
      items.push({
        id: `${checkpoint.id}:note:${hashContent(note).slice(0, 8)}`,
        projectId: checkpoint.projectId,
        sourceTurnId: null,
        type: "note",
        title: checkpoint.agentName ? `${checkpoint.agentName} note` : "IDE Note",
        content: note,
        pinned: false,
        isArchived: false,
        sortOrder: null,
        tags: [],
        updatedAt: checkpoint.createdAt,
        metadata,
        createdBy: checkpoint.userId,
        createdAt: checkpoint.createdAt,
        sourceSurface: checkpoint.surface === "mcp" || checkpoint.surface === "cli" ? "mcp" : null,
        sourceConversationId: checkpoint.threadId,
        sourceUrl: null,
        capturedAt: checkpoint.createdAt,
        derivedFrom: checkpoint.sourceEventIds,
        embedding: null,
        embeddingModel: null,
        forgetAfter: null,
        lastReaffirmedAt: null,
      })
    }
  }

  return items
}

function applyCheckpointSignalsToState(
  state: ProjectStateRow | null,
  checkpoints: WorkSessionCheckpointWithSessionRow[],
): ProjectStateRow | null {
  if (checkpoints.length === 0) return state

  const latest = checkpoints[0]
  if (!latest) return state

  const progress = normalizeCheckpointText(latest.structuredState.progress) ?? normalizeCheckpointText(latest.structuredState.summary)
  const currentObjective = normalizeCheckpointText(latest.structuredState.currentObjective)
  const relevantTools = checkpoints.flatMap((checkpoint) => normalizeCheckpointList(checkpoint.structuredState.relevantTools, 6))

  if (!state) {
    return {
      projectId: latest.projectId,
      projectOverview: null,
      currentObjective,
      stackDomain: null,
      recentProgress: progress,
      decisions: [],
      constraints: [],
      openTasks: [],
      relevantTools: Array.from(new Set(relevantTools)),
      objectiveHistory: [],
      lastBootstrapAt: null,
      dirty: true,
      createdAt: latest.createdAt,
      updatedAt: latest.createdAt,
    }
  }

  return {
    ...state,
    currentObjective: currentObjective ?? state.currentObjective,
    recentProgress:
      progress && (!state.recentProgress || new Date(latest.createdAt).getTime() >= new Date(state.updatedAt).getTime())
        ? progress
        : state.recentProgress,
    relevantTools: Array.from(new Set([...state.relevantTools, ...relevantTools])).slice(0, 10),
  }
}

interface ContinuityDelta {
  summaries: string[]
  decisions: string[]
  constraints: string[]
  tasks: string[]
  notes: string[]
}

function buildContinuityDelta(
  digests: SessionDigestRow[],
  memoryItems: MemoryItemRow[],
): ContinuityDelta {
  const summaries = Array.from(
    new Set(
      digests
        .map((digest) => normalizeText(digest.summaryShort))
        .filter(Boolean)
        .slice(0, 4),
    ),
  )

  const typed = (type: MemoryItemRow["type"]) =>
    Array.from(
      new Set(
        memoryItems
          .filter((item) => item.type === type)
          .map((item) => normalizeText(item.content))
          .filter(Boolean)
          .slice(0, 6),
      ),
    )

  const notes = Array.from(
    new Set(
      memoryItems
        .filter((item) => ["note", "requirement", "artifact"].includes(item.type))
        .map((item) => normalizeText(item.content))
        .filter(Boolean)
        .slice(0, 4),
    ),
  )

  return {
    summaries,
    decisions: typed("decision"),
    constraints: typed("constraint"),
    tasks: typed("task"),
    notes,
  }
}

function renderChatNewMarkdown(shape: BootstrapModelShape, profile: TargetProfileRow, memoryItems: MemoryItemRow[]) {
  // Collapse near-duplicates before rendering
  const dedupedDecisions = mergeGovernedList([], shape.decisions, "decision")
  const dedupedConstraints = mergeGovernedList([], shape.constraints, "constraint")
  const dedupedTasks = mergeGovernedList([], shape.openTasks, "task")

  const lines = [
    `Use this project brief for ${profile.name}.`,
    "",
    "You are joining this project in a fresh chat. Use the saved project context below so the user does not need to re-explain the work.",
    ""
  ]

  // Section order: Product thesis → Objective → Decisions → Architecture → Changes → Tasks → Notes → Constraints → Instructions
  appendTextSection(lines, "What This Project Is", shape.projectOverview)
  appendTextSection(lines, "Current Objective", shape.currentObjective)
  appendListSection(lines, "Decisions Already Made", dedupedDecisions)
  appendListSection(lines, "Architecture & Tools", shape.relevantTools)
  appendTextSection(lines, "What Changed Recently", shape.recentProgress)

  if (dedupedTasks.length) {
    lines.push("## Open Tasks")
    for (const task of dedupedTasks) {
      lines.push(`- ${escapeMarkdownInline(task)}`)
    }
    lines.push("")
  }

  // Key notes from memory items (risks / context signals)
  const relevantNotes = filterRelevantNotes(memoryItems)
  if (relevantNotes.length > 0) {
    lines.push("## Key Notes")
    for (const note of relevantNotes) {
      const label = note.title ? `**${escapeMarkdownInline(note.title)}**: ` : ""
      const age = formatAge(note.updatedAt)
      const suffix = age ? ` ${age}` : ""
      lines.push(`- ${label}${escapeMarkdownInline(note.content)}${suffix}`)
    }
    lines.push("")
  }

  appendListSection(lines, "Constraints", dedupedConstraints)
  appendTextSection(lines, "How To Continue", shape.firstAction)

  // Budget: keep under ~3500 tokens (rough estimate: text.length / 4)
  const result = lines.join("\n").trim()
  if (result.length / 4 > 3500) {
    // Truncate by removing notes and older decisions to stay within budget
    return renderChatNewMarkdown(
      { ...shape, decisions: shape.decisions.slice(0, 4) },
      profile,
      relevantNotes.slice(0, 2)
    )
  }

  return result
}

function renderChatContinueMarkdown(
  shape: BootstrapModelShape,
  profile: TargetProfileRow,
  delta?: ContinuityDelta | null,
  canonContext?: BootstrapCanonContext,
  settings?: BootstrapProjectSettingsContext,
) {
  const lines = [`Continue this project in ${profile.name}.`, ""]

  if (shape.currentObjective) {
    lines.push(`Current objective: ${shape.currentObjective}`)
  }

  if (shape.recentProgress) {
    lines.push(`Recent progress: ${shape.recentProgress}`)
  }

  if (shape.firstAction) {
    lines.push(`Next step: ${shape.firstAction}`)
  }

  lines.push("")

  const hasDelta = Boolean(
    delta &&
      (delta.summaries.length ||
        delta.decisions.length ||
        delta.constraints.length ||
        delta.tasks.length ||
        delta.notes.length),
  )

  if (hasDelta && delta) {
    lines.push("## Changes Since Last Sync")
    if (delta.summaries.length) {
      lines.push(...delta.summaries.map((item) => `- ${escapeMarkdownInline(item)}`))
    }
    lines.push("")
    appendListSection(lines, "New Decisions", delta.decisions.slice(0, 4))
    appendListSection(lines, "New Constraints", delta.constraints.slice(0, 4))
    appendListSection(lines, "New Tasks", delta.tasks.slice(0, 5))
    appendListSection(lines, "New Notes", delta.notes.slice(0, 3))
  }

  appendListSection(lines, "Open Tasks", shape.openTasks.slice(0, 5))
  appendListSection(lines, "Constraints", shape.constraints.slice(0, 5))

  if ((settings?.includeTentativeUpdatesInPackets ?? true) && canonContext?.tentativeEntries.length) {
    appendListSection(
      lines,
      "Tentative Updates",
      canonContext.tentativeEntries.slice(0, 3).map((entry) => entry.content),
    )
  }

  return lines.join("\n").trim()
}

function renderChatSmartDeltaMarkdown(
  shape: BootstrapModelShape,
  profile: TargetProfileRow,
  memoryItems: MemoryItemRow[],
  delta?: ContinuityDelta | null,
  canonContext?: BootstrapCanonContext,
  settings?: BootstrapProjectSettingsContext,
) {
  const lines = [
    `Use this compact Relay context for ${profile.name}.`,
    "",
    "This is not a transcript. It includes only durable project context and recent cross-tool changes likely missing from this chat.",
    "",
  ]

  appendTextSection(lines, "Project", shape.projectOverview)
  appendTextSection(lines, "Current Focus", shape.currentObjective)
  appendTextSection(lines, "Recent Change", canonContext?.latestCurrentFocusSummary ?? shape.recentProgress)

  const pinnedTruths = memoryItems
    .filter((item) => item.pinned && (item.type === "decision" || item.type === "constraint" || item.type === "requirement"))
    .map((item) => item.content)
  appendListSection(lines, "Foundational Truths", trimList(pinnedTruths, 4))

  const crossSurfaceItems = memoryItems
    .filter((item) => item.sourceSurface && item.sourceSurface !== profile.platform)
    .filter((item) => item.type === "decision" || item.type === "constraint" || item.type === "task" || item.type === "requirement")
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .map((item) => item.content)
  appendListSection(lines, "Likely Missing From This Chat", trimList(crossSurfaceItems, 5))

  if (delta) {
    appendListSection(lines, "Changes Since Last Sync", trimList([
      ...delta.summaries,
      ...delta.decisions,
      ...delta.constraints,
      ...delta.tasks,
    ], 6))
  }

  appendListSection(lines, "Open Tasks", trimList(shape.openTasks, 5))
  appendListSection(lines, "Constraints", trimList(shape.constraints, 5))

  if ((settings?.includeTentativeUpdatesInPackets ?? true) && canonContext?.tentativeEntries.length) {
    appendListSection(lines, "Tentative Updates", trimList(canonContext.tentativeEntries.map((entry) => entry.content), 3))
  }

  appendTextSection(lines, "Next Action", shape.firstAction)

  const rendered = lines.join("\n").trim()
  if (rendered.length / 4 <= 1200) return rendered

  const capped: string[] = []
  for (const line of lines) {
    const next = [...capped, line].join("\n").trim()
    if (next.length / 4 > 1200) break
    capped.push(line)
  }

  return capped.join("\n").trim()
}

function renderAgentQuickMarkdown(
  shape: BootstrapModelShape,
  profile: TargetProfileRow,
  delta?: ContinuityDelta | null,
  canonContext?: BootstrapCanonContext,
  settings?: BootstrapProjectSettingsContext,
) {
  const lines = [`Continue this project in ${profile.name}.`, ""]

  appendTextSection(lines, "Current Objective", shape.currentObjective)
  appendTextSection(lines, "Recent Progress", canonContext?.latestCurrentFocusSummary ?? shape.recentProgress)
  appendListSection(lines, "Current Decisions", trimList(shape.decisions, 6))
  appendListSection(lines, "Current Constraints", trimList(shape.constraints, 6))
  appendListSection(lines, "Open Tasks", trimList(shape.openTasks, 6))
  appendListSection(lines, "Relevant Tools", trimList(shape.relevantTools, 6))

  if (delta) {
    appendListSection(lines, "Recent Changes", trimList(delta.summaries, 4))
  }

  if ((settings?.includeTentativeUpdatesInPackets ?? true) && canonContext?.tentativeEntries.length) {
    appendListSection(lines, "Tentative Updates", trimList(canonContext.tentativeEntries.map((entry) => entry.content), 4))
  }

  appendTextSection(lines, "Next Action", shape.firstAction)
  return lines.join("\n").trim()
}

function renderAgentFullMarkdown(
  shape: BootstrapModelShape,
  profile: TargetProfileRow,
  memoryItems: MemoryItemRow[],
  canonContext?: BootstrapCanonContext,
  settings?: BootstrapProjectSettingsContext,
) {
  const lines = [`Use this execution brief for ${profile.name}.`, ""]

  appendTextSection(lines, "Project Overview", canonContext?.latestProjectSummary ?? shape.projectOverview)
  appendTextSection(lines, "Current Objective", shape.currentObjective)
  appendTextSection(lines, "Recent Progress", canonContext?.latestCurrentFocusSummary ?? shape.recentProgress)
  appendListSection(lines, "Current Truths", trimList([...shape.decisions, ...shape.constraints], 8))
  appendListSection(lines, "Open Tasks", trimList(shape.openTasks, 8))
  appendListSection(lines, "Relevant Tools", trimList(shape.relevantTools, 8))

  const relevantNotes = filterRelevantNotes(memoryItems)
  if (relevantNotes.length > 0) {
    lines.push("## Supporting Evidence")
    for (const note of trimList(relevantNotes.map((note) => note.content), 5)) {
      lines.push(`- ${escapeMarkdownInline(note)}`)
    }
    lines.push("")
  }

  if ((settings?.includeTentativeUpdatesInPackets ?? true) && canonContext?.tentativeEntries.length) {
    appendListSection(lines, "Tentative Updates", trimList(canonContext.tentativeEntries.map((entry) => entry.content), 5))
  }

  appendTextSection(lines, "Next Action", shape.firstAction)
  return lines.join("\n").trim()
}

export function renderBootstrapMarkdown(
  shape: BootstrapModelShape,
  profile: TargetProfileRow,
  kind: BootstrapRequest["kind"],
  memoryItems: MemoryItemRow[] = [],
  input: {
    delta?: ContinuityDelta | null
    canonContext?: BootstrapCanonContext
    packetMode?: PacketMode
    settings?: BootstrapProjectSettingsContext
  } = {},
) {
  const mode = input.packetMode ?? inferPacketMode(profile, kind)

  if (mode === "chat_continue") {
    return renderChatContinueMarkdown(shape, profile, input.delta, input.canonContext, input.settings)
  }

  if (mode === "chat_smart_delta") {
    return renderChatSmartDeltaMarkdown(shape, profile, memoryItems, input.delta, input.canonContext, input.settings)
  }

  if (mode === "agent_quick_continuity") {
    return renderAgentQuickMarkdown(shape, profile, input.delta, input.canonContext, input.settings)
  }

  if (mode === "agent_full_bootstrap") {
    return renderAgentFullMarkdown(shape, profile, memoryItems, input.canonContext, input.settings)
  }

  return renderChatNewMarkdown(shape, profile, memoryItems)
}

function describeJobStage(stage: string | null) {
  if (!stage) return null

  const labels: Record<string, string> = {
    queued: "queued",
    count_tokens_primary: "counting tokens on the primary model",
    generate_primary: "generating with the primary model",
    count_tokens_fallback: "counting tokens on the fallback model",
    generate_fallback: "generating with the fallback model",
    merge_state: "merging the digest into project state",
    completed: "completed",
    failed: "failed",
    timed_out: "timed out"
  }

  return labels[stage] ?? stage.replaceAll("_", " ")
}

async function generateGeminiBootstrap(input: {
  userId: string
  projectId: string
  state: ProjectStateRow | null
  digests: SessionDigestRow[]
  canonContext: BootstrapCanonContext
  settings: BootstrapProjectSettingsContext
  profile: TargetProfileRow
  kind: BootstrapRequest["kind"]
  packetMode: PacketMode
  modelConfig: {
    primaryModel: string
    fallbackModel: string
  }
}) {
  const startedAtMs = Date.now()

  try {
    const result = await runGeminiJsonWithFallback<BootstrapModelShape>({
      primaryModel: input.modelConfig.primaryModel,
      fallbackModel: input.modelConfig.fallbackModel,
      maxInputTokens: GEMINI_MODELS.bootstrap.maxInputTokens,
      maxOutputTokens: GEMINI_MODELS.bootstrap.maxOutputTokens,
      systemInstruction:
        input.packetMode === "agent_full_bootstrap"
          ? "You write execution briefs for coding agents. Return only JSON. Prefer durable truths, operational tasks, constraints, relevant tools, and precise next actions."
          : input.packetMode === "agent_quick_continuity"
            ? "You write short operational continuity briefs for coding agents. Return only JSON. Prefer current objective, recent progress, tasks, constraints, and next action."
            : input.kind === "quick_continuity"
              ? "You write short continuation briefs for ongoing AI chats. Return only JSON. Prefer immediate task continuity, recent progress, constraints, and the next action."
              : "You write explanatory project briefs for fresh AI chats. Return only JSON. Prefer durable project state, clear tasks, and concise sections over transcript detail.",
      prompt: [
        "Return a JSON object with these keys exactly:",
        "projectOverview, currentObjective, recentProgress, decisions, constraints, openTasks, relevantTools, firstAction.",
        "Do not include markdown in the JSON values.",
        input.packetMode === "agent_full_bootstrap"
          ? "Make this execution brief operational and source-aware for a coding agent."
          : input.packetMode === "agent_quick_continuity"
            ? "Make this continuity brief compact but operational for a coding agent."
            : input.kind === "quick_continuity"
              ? "Make this continuation brief short, immediate, and task-focused."
              : "Make this fresh-chat brief explanatory enough that a new chat can continue without a re-brief.",
        `Target profile: ${input.profile.name}`,
        ...(input.state?.projectOverview ? [`Project overview: ${input.state.projectOverview}`] : []),
        ...(input.state?.currentObjective ? [`Current objective: ${input.state.currentObjective}`] : []),
        ...(input.state?.recentProgress ? [`Recent progress: ${input.state.recentProgress}`] : []),
        ...(input.canonContext.latestProjectSummary ? [`Latest project summary: ${input.canonContext.latestProjectSummary}`] : []),
        ...(input.canonContext.latestCurrentFocusSummary ? [`Latest current focus: ${input.canonContext.latestCurrentFocusSummary}`] : []),
        ...((input.state?.decisions ?? []).length ? [`Decisions: ${input.state!.decisions.join(" | ")}`] : []),
        ...((input.state?.constraints ?? []).length ? [`Constraints: ${input.state!.constraints.join(" | ")}`] : []),
        ...((input.state?.openTasks ?? []).length ? [`Open tasks: ${input.state!.openTasks.join(" | ")}`] : []),
        ...((input.state?.relevantTools ?? []).length ? [`Relevant tools: ${input.state!.relevantTools.join(" | ")}`] : []),
        ...(input.settings.includeTentativeUpdatesInPackets && (input.canonContext.tentativeEntries ?? []).length
          ? [`Tentative updates: ${input.canonContext.tentativeEntries.slice(0, 4).map((entry) => entry.content).join(" | ")}`]
          : []),
        ...(() => {
          const summaries = input.digests
            .filter((digest) => !isLowSignalDigestSummary(digest.summaryShort))
            .slice(0, 6)
            .map((digest, index) => `${index + 1}. ${digest.summaryShort}`)
            .join("\n")
          return summaries ? ["Recent digest summaries:", summaries] : []
        })()
      ].join("\n\n")
    })

    await emitAiRequestCompleted({
      userId: input.userId,
      projectId: input.projectId,
      operation: input.packetMode,
      jobKind: input.kind,
      primaryModel: result.primaryModel,
      actualModel: result.actualModel,
      fallbackUsed: result.fallbackUsed,
      tokenUsage: result.tokenUsage,
      latencyMs: Math.max(0, Date.now() - startedAtMs),
      success: true,
    })

    return {
      shape: sanitizeBootstrapShape(result.data, input.state),
      actualModel: result.actualModel,
      primaryModel: result.primaryModel,
      fallbackUsed: result.fallbackUsed,
      tokenUsage: result.tokenUsage
    }
  } catch (error) {
    await emitAiRequestCompleted({
      userId: input.userId,
      projectId: input.projectId,
      operation: input.packetMode,
      jobKind: input.kind,
      primaryModel: input.modelConfig.primaryModel,
      actualModel: null,
      fallbackUsed: false,
      tokenUsage: null,
      latencyMs: Math.max(0, Date.now() - startedAtMs),
      success: false,
      failurePhase: "bootstrap_generation",
    })
    throw error
  }
}

function getPendingReason(stateStatus: ProjectStateStatusDto) {
  const stageLabel = describeJobStage(stateStatus.activeJobStage)

  if (stateStatus.digestStatus === "failed") {
    if (stateStatus.digestErrorMessage && stageLabel) {
      return `Digest failed while ${stageLabel}. ${stateStatus.digestErrorMessage}`
    }

    return stateStatus.digestErrorMessage ?? "Digest failed. Refresh Relay or capture the chat again."
  }

  if (stateStatus.digestStatus === "timed_out") {
    return stageLabel
      ? `Digest timed out while ${stageLabel}. Relay is ready to retry it.`
      : "Relay is retrying the digest for this chat. Try again in a moment."
  }

  if (stateStatus.digestStatus === "running" || stateStatus.digestStatus === "pending") {
    return stageLabel
      ? `Digest pending. Relay is ${stageLabel}.`
      : "Digest pending. Relay is still turning this chat into project state."
  }

  if (stateStatus.rawCapturePresent) {
    return "Digest pending. Relay is still turning this chat into project state."
  }

  return "Capture a meaningful chat first so Relay can build project state."
}

export function shouldDeferBootstrapGeneration(state: ProjectStateRow | null, digests: SessionDigestRow[]) {
  return !state && digests.length === 0
}

function latestTimestamp(value: string | null | undefined) {
  return value ? new Date(value).getTime() : 0
}

function hasPendingCaptureFreshnessGap(input: {
  latestSession: SourceSessionRow | null
  digests: SessionDigestRow[]
  digestJobs: AiJobRunRow[]
}) {
  if (!input.latestSession) return false

  const latestSessionAt = latestTimestamp(input.latestSession.capturedAt)
  const latestDigestAt = latestTimestamp(input.digests[0]?.createdAt ?? null)
  // Only block on actively in-flight jobs — timed_out/deferred don't need to block bootstrap
  const hasPendingJobs = input.digestJobs.some((job) => job.status === "pending" || job.status === "running")

  if (!input.digests[0]) {
    return hasPendingJobs
  }

  return hasPendingJobs && latestSessionAt > latestDigestAt
}

export async function generateBootstrapForProject(userId: string, projectId: string, input: unknown): Promise<BootstrapGenerationResult> {
  const repositories = createRepositoryBundle(userId)
  const parsed = bootstrapRequestSchema.parse(input)
  const entitlements = await resolveViewerEntitlements(userId)
  const [project, profile] = await Promise.all([
    repositories.projects.getById(projectId),
    repositories.targetProfiles.getByKey(parsed.targetProfileKey),
  ])

  let [rawState, digests, memoryItems, stateOverrides, workSessionContext, canonEntries, summarySnapshots, projectSettings, latestSession, digestJobs] = await Promise.all([
    repositories.projectState.getByProject(projectId),
    repositories.sessionDigests.listByProject(projectId),
    repositories.memory.listByProject(projectId),
    repositories.projectStateOverrides.getByProject(projectId),
    repositories.workSessionCheckpoints.listRecentByProject(projectId, {
      since: parsed.since,
      limit: 8,
      surfaces: ["mcp", "cli", "chatgpt", "claude", "gemini", "grok", "perplexity", "deepseek", "codex"],
    }),
    repositories.canonEntries.listByProject(projectId, { statuses: ["active", "tentative", "disputed"], limit: 64 }).catch(() => []),
    repositories.projectSummarySnapshots.listLatestByProject(projectId, { limit: 12 }).catch(() => []),
    repositories.projectSettings.getByProject(projectId).catch(() => null),
    repositories.sessions.listByProject(projectId, { limit: 1 }).then((sessions) => sessions[0] ?? null),
    repositories.aiJobs.listByProject(projectId, {
      jobKind: "session_digest",
      statuses: ["pending", "running"],
      limit: 6,
    }),
  ])

  if (!project) {
    throw new NotFoundError("Project not found.")
  }

  if (!profile) {
    throw new NotFoundError("Target profile not found.")
  }

  if (hasPendingCaptureFreshnessGap({ latestSession, digests, digestJobs })) {
    await drainDigestJobsForProject(userId, projectId, 2)
    await logServerEvent({
      level: "info",
      surface: "web-api",
      area: "bootstrap",
      event: "bootstrap_digest_drain",
      message: "Paused bootstrap generation until pending digest work finished.",
      userId,
      context: {
        projectId,
        latestSessionAt: latestSession?.capturedAt ?? null,
        latestDigestAt: digests[0]?.createdAt ?? null,
        pendingJobs: digestJobs.length,
      },
    }).catch(() => {})

    ;[rawState, digests, memoryItems, stateOverrides, workSessionContext, canonEntries, summarySnapshots, projectSettings, latestSession, digestJobs] = await Promise.all([
      repositories.projectState.getByProject(projectId),
      repositories.sessionDigests.listByProject(projectId),
      repositories.memory.listByProject(projectId),
      repositories.projectStateOverrides.getByProject(projectId),
      repositories.workSessionCheckpoints.listRecentByProject(projectId, {
        since: parsed.since,
        limit: 8,
        surfaces: ["mcp", "cli", "chatgpt", "claude", "gemini", "grok", "perplexity", "deepseek", "codex"],
      }),
      repositories.canonEntries.listByProject(projectId, { statuses: ["active", "tentative", "disputed"], limit: 64 }).catch(() => []),
      repositories.projectSummarySnapshots.listLatestByProject(projectId, { limit: 12 }).catch(() => []),
      repositories.projectSettings.getByProject(projectId).catch(() => null),
      repositories.sessions.listByProject(projectId, { limit: 1 }).then((sessions) => sessions[0] ?? null),
      repositories.aiJobs.listByProject(projectId, {
        jobKind: "session_digest",
        statuses: ["pending", "running", "timed_out", "deferred"],
        limit: 6,
      }),
    ])
  }

  const activeMemoryItems = memoryItems.filter((item) => !item.isArchived)

  // Build effective state by merging derived state + overrides + memory items
  const derivedStateDto = rawState
    ? {
        projectOverview: rawState.projectOverview,
        currentObjective: rawState.currentObjective,
        stackDomain: rawState.stackDomain,
        recentProgress: rawState.recentProgress,
        decisions: rawState.decisions,
        constraints: rawState.constraints,
        openTasks: rawState.openTasks,
        relevantTools: rawState.relevantTools,
        lastBootstrapAt: rawState.lastBootstrapAt,
        dirty: rawState.dirty,
        updatedAt: rawState.updatedAt
      }
    : null
  const overrideDto = stateOverrides
    ? {
        projectOverviewOverride: stateOverrides.projectOverviewOverride,
        currentObjectiveOverride: stateOverrides.currentObjectiveOverride,
        recentProgressOverride: stateOverrides.recentProgressOverride,
        hiddenDecisions: stateOverrides.hiddenDecisions,
        hiddenConstraints: stateOverrides.hiddenConstraints,
        hiddenOpenTasks: stateOverrides.hiddenOpenTasks,
        updatedAt: stateOverrides.updatedAt
      }
    : null
  const workSessionMemoryDtos = workSessionCheckpointToMemoryDtos(workSessionContext)
  const memoryDtos = [...activeMemoryItems, ...workSessionMemoryDtos].map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    content: item.content,
    pinned: item.pinned,
    updatedAt: item.updatedAt,
    metadata: item.metadata,
    sourceSurface: item.sourceSurface,
    sourceUrl: item.sourceUrl,
    capturedAt: item.capturedAt,
  }))
  const effectiveStateDto = buildEffectiveProjectState(derivedStateDto, overrideDto, memoryDtos)

  // Map effective state back to a ProjectStateRow-shaped object for bootstrap functions
  const baseState: ProjectStateRow | null = effectiveStateDto
    ? {
        projectId,
        projectOverview: effectiveStateDto.projectOverview,
        currentObjective: effectiveStateDto.currentObjective,
        stackDomain: effectiveStateDto.stackDomain,
        recentProgress: effectiveStateDto.recentProgress,
        decisions: effectiveStateDto.decisions,
        constraints: effectiveStateDto.constraints,
        openTasks: effectiveStateDto.openTasks,
        relevantTools: effectiveStateDto.relevantTools,
        objectiveHistory: rawState?.objectiveHistory ?? [],
        lastBootstrapAt: effectiveStateDto.lastBootstrapAt,
        dirty: effectiveStateDto.dirty,
        createdAt: rawState?.createdAt ?? new Date(0).toISOString(),
        updatedAt: effectiveStateDto.updatedAt
      }
    : null
  const stateWithCheckpoints = applyCheckpointSignalsToState(baseState, workSessionContext)
  const canonContext = buildBootstrapCanonView(canonEntries, summarySnapshots, stateWithCheckpoints)
  const state = canonContext.state
  const settings: BootstrapProjectSettingsContext = {
    includeTentativeUpdatesInPackets: projectSettings?.settings.includeTentativeUpdatesInPackets ?? true,
  }
  const packetMode = inferPacketMode(profile, parsed.kind, parsed.packetMode)

  const sinceTime = parsed.since ? new Date(parsed.since).getTime() : null
  const scopedDigests = sinceTime
    ? digests.filter((digest) => new Date(digest.createdAt).getTime() >= sinceTime)
    : digests
  const scopedMemoryItems = sinceTime
    ? [...activeMemoryItems, ...workSessionMemoryDtos].filter((item) => new Date(item.updatedAt).getTime() >= sinceTime)
    : [...activeMemoryItems, ...workSessionMemoryDtos]
  const continuityDelta = sinceTime ? buildContinuityDelta(scopedDigests, scopedMemoryItems) : null

  const stateStatus = await getProjectStateStatus(repositories, projectId)
  if (shouldDeferBootstrapGeneration(state, scopedDigests)) {
    return {
      status: "pending",
      packet: null,
      reason: getPendingReason(stateStatus),
      resolvedTargetProfileKey: parsed.targetProfileKey,
      stateStatus
    }
  }

  const briefInputHash = computeBootstrapInputHash({
      project,
      state,
      digests: scopedDigests,
      profile,
      kind: parsed.kind,
      packetMode,
      // packet mode affects packet content and cache reuse
      since: parsed.since,
      canonEntries,
      summarySnapshots,
      memoryItemCount: scopedMemoryItems.length,
      memoryLatestUpdatedAt: scopedMemoryItems[0]?.updatedAt ?? null,
    })
  const latest = await repositories.bootstrapPackets.getLatest(projectId, profile.id, parsed.kind)
  const hasPendingCapture = latestTimestamp(latestSession?.capturedAt ?? null) > latestTimestamp(scopedDigests[0]?.createdAt ?? null)
  if (
    latest &&
    shouldReuseLatestBootstrapPacket({
      latestCreatedAt: latest.createdAt,
      latestDigestCreatedAt: scopedDigests[0]?.createdAt ?? null,
      stateDirty: Boolean(state?.dirty),
      deep: Boolean(parsed.deep),
      hasPendingCapture,
      latestInputHash:
        typeof latest.generationMetadata?.input_hash === "string"
          ? String(latest.generationMetadata.input_hash)
          : null,
      currentInputHash: briefInputHash,
    })
  ) {
    await logServerEvent({
      level: "info",
      surface: "web-api",
      area: "bootstrap",
      event: "bootstrap_served",
      message: "Served a cached Relay bootstrap packet.",
      userId,
      context: {
        projectId,
        kind: parsed.kind,
        readMode: resolveReadMode({ deep: parsed.deep, packetMode }),
        deep: Boolean(parsed.deep),
        reusedCachedPacket: true,
        staleReusePrevented: false,
        pendingDigestJobs: digestJobs.length,
        renderer: latest.renderer,
        actualModel: latest.renderer,
        packetMode,
      },
    }).catch(() => {})

    // Keep one packet per profile+kind so regeneration replaces stale rows.
    await repositories.bootstrapPackets.clearVariant(projectId, profile.id, parsed.kind, latest.id)

    return {
      status: "ready",
      packet: latest,
      reason: null,
      resolvedTargetProfileKey: parsed.targetProfileKey,
      stateStatus
    }
  }

  const preferredRenderer = inferRenderer(parsed, state)
  const modelConfig = resolveBootstrapModelConfig({
    plan: entitlements.plan,
    packetMode,
    preferredRenderer,
  })
  const deterministic = deterministicBootstrap(state, scopedDigests, profile, parsed.kind)

  let shape = deterministic
  let renderer: BootstrapPacketRow["renderer"] = modelConfig.renderer
  let actualModel = "deterministic"
  let primaryModel = modelConfig.primaryModel
  let fallbackUsed = false
  let tokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

  if (modelConfig.renderer === "gemini") {
    try {
      const generated = await generateGeminiBootstrap({
        userId,
        projectId,
        state,
        digests: scopedDigests,
        canonContext,
        settings,
        profile,
        kind: parsed.kind,
        packetMode,
        modelConfig,
      })
      shape = generated.shape
      renderer = "gemini"
      actualModel = generated.actualModel
      primaryModel = generated.primaryModel
      fallbackUsed = generated.fallbackUsed
      tokenUsage = generated.tokenUsage
    } catch {
      shape = deterministic
    }
  }

  const packet = await repositories.bootstrapPackets.create({
    projectId,
    targetProfileId: profile.id,
    kind: parsed.kind,
    content: renderBootstrapMarkdown(shape, profile, parsed.kind, scopedMemoryItems, {
      delta: continuityDelta,
      canonContext,
      packetMode,
      settings,
    }),
    structuredSnapshot: { ...shape, packetMode },
    renderer,
    generationMetadata: {
      input_hash: briefInputHash,
      plan: entitlements.plan,
      primary_model: primaryModel,
      actual_model: actualModel,
      fallback_used: fallbackUsed,
      token_usage: tokenUsage,
      packet_mode: packetMode,
    },
    createdBy: userId
  })

  // Keep one packet per profile+kind so regeneration replaces stale rows.
  await repositories.bootstrapPackets.clearVariant(projectId, profile.id, parsed.kind, packet.id)

  await fireUserMilestone(userId, "first_brief_generated", {
    project_id: projectId,
    profile_key: profile.key ?? null,
    kind: parsed.kind,
  }).catch(() => {})

  if (rawState) {
    await repositories.projectState.markBootstrapped(projectId)
  }

  const aiJob = await repositories.aiJobs.create({
    projectId,
    sessionId: null,
    createdBy: userId,
    jobKind: parsed.kind,
    inputPayload: {
      targetProfileKey: parsed.targetProfileKey
    },
    primaryModel: primaryModel === "deterministic" ? null : primaryModel
  })

  await repositories.aiJobs.markCompleted(aiJob.id, {
    actualModel,
    fallbackUsed,
    tokenUsage,
    outputPayload: {
      packetId: packet.id,
      renderer
    }
  })

  await logServerEvent({
    level: "info",
    surface: "web-api",
    area: "bootstrap",
    event: "bootstrap_served",
    message: "Served a Relay bootstrap packet.",
    userId,
    context: {
      projectId,
      kind: parsed.kind,
      readMode: resolveReadMode({ deep: parsed.deep, packetMode }),
      deep: Boolean(parsed.deep),
      reusedCachedPacket: false,
      staleReusePrevented: hasPendingCapture,
      pendingDigestJobs: digestJobs.length,
      renderer,
      actualModel,
      packetMode,
    },
  }).catch(() => {})

  return {
    status: "ready",
    packet,
    reason: null,
    resolvedTargetProfileKey: parsed.targetProfileKey,
    stateStatus: {
      ...stateStatus,
      digestStatus: "completed",
      projectStateReady: Boolean(rawState ?? digests.length > 0),
      lastDigestAt: packet.createdAt
    }
  }
}

export async function getLatestBootstrapForProject(userId: string, projectId: string, targetProfileKey: string, kind: BootstrapPacketRow["kind"]) {
  const repositories = createRepositoryBundle(userId)
  const profile = await repositories.targetProfiles.getByKey(targetProfileKey)
  if (!profile) {
    throw new NotFoundError("Target profile not found.")
  }

  return repositories.bootstrapPackets.getLatest(projectId, profile.id, kind)
}

export async function listBootstrapPacketsForProject(userId: string, projectId: string): Promise<BootstrapPacketDto[]> {
  const repositories = createRepositoryBundle(userId)
  const [packets, profiles] = await Promise.all([repositories.bootstrapPackets.listByProject(projectId), repositories.targetProfiles.listAll()])
  const profileById = new Map(profiles.map((profile) => [profile.id, profile.key]))

  return packets.map((packet) => ({
    id: packet.id,
    kind: packet.kind,
    content: packet.content,
    targetProfileKey: profileById.get(packet.targetProfileId) ?? "unknown",
    renderer: packet.renderer,
    createdAt: packet.createdAt
  }))
}
