import { createRepositoryBundle } from "@relay/db"
import type {
  RecentWorkSessionContext,
  SyncSurface,
  WorkSessionCheckpointRequest,
  WorkSessionCloseRequest,
  WorkSessionOpenRequest,
  WorkSessionRow,
  WorkSessionStructuredState,
} from "@relay/shared"
import {
  workSessionCheckpointSchema,
  workSessionCloseSchema,
  workSessionOpenSchema,
} from "@relay/shared"

function normalizeTextValue(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizeList(value: string[] | undefined) {
  if (!Array.isArray(value)) return []
  return value.map((item) => item.trim()).filter(Boolean).slice(0, 12)
}

function normalizeStructuredState(
  state: WorkSessionStructuredState | undefined,
): WorkSessionStructuredState {
  if (!state) return {}

  return {
    summary: normalizeTextValue(state.summary),
    progress: normalizeTextValue(state.progress),
    currentObjective: normalizeTextValue(state.currentObjective),
    decisions: normalizeList(state.decisions),
    constraints: normalizeList(state.constraints),
    nextSteps: normalizeList(state.nextSteps),
    notes: normalizeList(state.notes),
    relevantTools: normalizeList(state.relevantTools),
    touchedFiles: normalizeList(state.touchedFiles),
    reaffirmedFacts: normalizeList(state.reaffirmedFacts),
  }
}

function hasMeaningfulStructuredState(state: WorkSessionStructuredState) {
  return Boolean(
    state.summary ||
      state.progress ||
      state.currentObjective ||
      state.decisions?.length ||
      state.constraints?.length ||
      state.nextSteps?.length ||
      state.notes?.length ||
      state.relevantTools?.length ||
      state.touchedFiles?.length ||
      state.reaffirmedFacts?.length,
  )
}

function summaryFromStructuredState(
  summaryShort: string | undefined,
  state: WorkSessionStructuredState,
) {
  return (
    normalizeTextValue(summaryShort) ??
    state.progress ??
    state.summary ??
    state.currentObjective ??
    state.decisions?.[0] ??
    state.nextSteps?.[0] ??
    null
  )
}

function isSyncSurface(surface: WorkSessionRow["surface"]): surface is SyncSurface {
  return [
    "mcp",
    "cli",
    "chatgpt",
    "claude",
    "codex",
    "opencode",
    "gemini",
    "cursor",
    "warp",
    "windsurf",
    "antigravity",
    "grok",
    "perplexity",
    "deepseek",
  ].includes(surface)
}

function getWorkSessionReuseWindowMs(surface: WorkSessionRow["surface"]) {
  switch (surface) {
    case "mcp":
    case "cli":
      return 90 * 60 * 1000
    case "chatgpt":
    case "claude":
    case "gemini":
    case "grok":
    case "perplexity":
    case "deepseek":
    case "codex":
      return 8 * 60 * 60 * 1000
    default:
      return 2 * 60 * 60 * 1000
  }
}

export async function openWorkSession(
  userId: string,
  projectId: string,
  input: unknown,
) {
  const repositories = createRepositoryBundle(userId)
  const parsed = workSessionOpenSchema.parse(input) as WorkSessionOpenRequest
  const staleBefore = new Date(Date.now() - getWorkSessionReuseWindowMs(parsed.surface)).toISOString()

  await repositories.workSessions.markStaleOlderThan({
    projectId,
    surface: parsed.surface,
    olderThan: staleBefore,
    workspaceId: parsed.workspaceId ?? null,
    threadId: parsed.threadId ?? null,
    clientName: parsed.clientName ?? null,
  })

  const existing = await repositories.workSessions.findReusableActiveSession({
    projectId,
    surface: parsed.surface,
    workspaceId: parsed.workspaceId ?? null,
    threadId: parsed.threadId ?? null,
    clientName: parsed.clientName ?? null,
    updatedSince: staleBefore,
  })

  if (existing) {
    await repositories.workSessions.touch(existing.id)
    return existing
  }

  const syncMark = isSyncSurface(parsed.surface)
    ? await repositories.syncMarks.getBySurface(projectId, userId, parsed.surface)
    : null

  const session = await repositories.workSessions.create({
    projectId,
    userId,
    workspaceId: parsed.workspaceId ?? null,
    surface: parsed.surface,
    threadId: parsed.threadId ?? null,
    agentName: parsed.agentName ?? null,
    clientName: parsed.clientName ?? null,
    associationMethod: parsed.associationMethod ?? null,
    associationConfidence: parsed.associationConfidence ?? null,
    baseSyncMarkAt: syncMark?.lastSyncAt ?? null,
  })

  await repositories.workSessionEvents.create({
    workSessionId: session.id,
    projectId,
    userId,
    eventType: "session_opened",
    payload: {
      workspaceId: parsed.workspaceId ?? null,
      clientName: parsed.clientName ?? null,
      agentName: parsed.agentName ?? null,
      associationMethod: parsed.associationMethod ?? null,
      associationConfidence: parsed.associationConfidence ?? null,
      baseSyncMarkAt: syncMark?.lastSyncAt ?? null,
    },
    sourceSurface: parsed.surface,
    sourceThreadId: parsed.threadId ?? null,
  })

  return session
}

export async function checkpointWorkSession(
  userId: string,
  projectId: string,
  input: unknown,
) {
  const repositories = createRepositoryBundle(userId)
  const parsed = workSessionCheckpointSchema.parse(input) as WorkSessionCheckpointRequest
  const session = await repositories.workSessions.getById(parsed.sessionId)

  if (!session || session.projectId !== projectId || session.userId !== userId) {
    throw new Error("Work session not found.")
  }

  const structuredState = normalizeStructuredState(parsed.structuredState)
  const event = await repositories.workSessionEvents.create({
    workSessionId: session.id,
    projectId,
    userId,
    eventType: parsed.eventType ?? "session_checkpoint",
    payload: parsed.eventPayload ?? {},
    sourceSurface: session.surface,
    sourceThreadId: session.threadId,
  })

  if (!hasMeaningfulStructuredState(structuredState)) {
    const touched = await repositories.workSessions.updateLatestState({
      id: session.id,
    })
    return { session: touched, checkpoint: null }
  }

  const checkpoint = await repositories.workSessionCheckpoints.create({
    workSessionId: session.id,
    projectId,
    userId,
    summaryShort: summaryFromStructuredState(parsed.summaryShort, structuredState),
    structuredState: structuredState as Record<string, unknown>,
    sourceEventIds: [event.id],
    confidence: parsed.confidence ?? null,
  })

  await repositories.workSessions.updateLatestState({
    id: session.id,
    latestSummary: checkpoint.summaryShort,
    latestStructuredState: structuredState as Record<string, unknown>,
  })
  await repositories.bootstrapPackets.clearProject(projectId)

  return { session: await repositories.workSessions.getById(session.id), checkpoint }
}

export async function closeWorkSession(
  userId: string,
  projectId: string,
  input: unknown,
) {
  const repositories = createRepositoryBundle(userId)
  const parsed = workSessionCloseSchema.parse(input) as WorkSessionCloseRequest
  const session = await repositories.workSessions.getById(parsed.sessionId)

  if (!session || session.projectId !== projectId || session.userId !== userId) {
    throw new Error("Work session not found.")
  }

  const structuredState = normalizeStructuredState(parsed.structuredState)
  let finalSummary = normalizeTextValue(parsed.summaryShort) ?? null

  if (hasMeaningfulStructuredState(structuredState)) {
    const event = await repositories.workSessionEvents.create({
      workSessionId: session.id,
      projectId,
      userId,
      eventType: "session_finalized",
      payload: {
        closed: true,
      },
      sourceSurface: session.surface,
      sourceThreadId: session.threadId,
    })

    const checkpoint = await repositories.workSessionCheckpoints.create({
      workSessionId: session.id,
      projectId,
      userId,
      summaryShort: summaryFromStructuredState(parsed.summaryShort, structuredState),
      structuredState: structuredState as Record<string, unknown>,
      sourceEventIds: [event.id],
      confidence: parsed.confidence ?? null,
    })
    finalSummary = checkpoint.summaryShort
  }

  await repositories.workSessionEvents.create({
    workSessionId: session.id,
    projectId,
    userId,
    eventType: "session_closed",
    payload: {
      summaryShort: finalSummary,
    },
    sourceSurface: session.surface,
    sourceThreadId: session.threadId,
  })

  const closed = await repositories.workSessions.updateLatestState({
    id: session.id,
    latestSummary: finalSummary,
    latestStructuredState: hasMeaningfulStructuredState(structuredState)
      ? (structuredState as Record<string, unknown>)
      : session.latestStructuredState,
    status: "closed",
    endedAt: new Date().toISOString(),
  })
  await repositories.bootstrapPackets.clearProject(projectId)

  return { session: closed }
}

export async function getRecentWorkSessionContext(
  userId: string,
  projectId: string,
  input: { since?: string; limit?: number } = {},
): Promise<RecentWorkSessionContext> {
  const repositories = createRepositoryBundle(userId)
  const checkpoints = await repositories.workSessionCheckpoints.listRecentByProject(projectId, {
    since: input.since,
    limit: input.limit ?? 8,
    surfaces: ["mcp", "cli"],
  })

  return { checkpoints }
}
