import { createRepositoryBundle, type RepositoryBundle } from "@relay/db"
import type {
  ProjectRow,
  ProjectStateRow,
  SessionDigestShape,
  WorkSessionRow,
  WorkSessionStructuredState,
} from "@relay/shared"

import { observeAndReflectDigestWithRepositories } from "./canon-autonomy-service"
import { invalidateProjectCache } from "@/server/cache/invalidation"
import { reconcileAfterDigest, type ReconciliationResult, type TruthMaintenanceArchiveDecision } from "./context-reconciliation-service"
import { runTruthMaintenancePass } from "./digest-service"
import { mergeDigestIntoState } from "./project-state-service"

export interface FlushWorkSessionInput {
  sessionId: string
  reason?: string
  summaryShort?: string | null
  /** Overrides the session's latest structured state (e.g. passed from save_context tool) */
  structuredState?: WorkSessionStructuredState | null
}

export interface FlushWorkSessionResult {
  session: WorkSessionRow
  /** True when digest pipeline ran and produced state changes */
  flushed: boolean
  /** Reason the flush was skipped, when flushed is false */
  skipReason?: "already_closed" | "no_state" | "not_found"
  reconciliation?: ReconciliationResult
  nextState?: ProjectStateRow
}

function normalizeTextValue(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizeList(value: ReadonlyArray<string | null | undefined> | undefined | null): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item): item is string => Boolean(item))
    .slice(0, 24)
}

function hasMeaningfulState(state: WorkSessionStructuredState) {
  return Boolean(
    normalizeTextValue(state.summary) ||
      normalizeTextValue(state.progress) ||
      normalizeTextValue(state.currentObjective) ||
      state.decisions?.length ||
      state.constraints?.length ||
      state.nextSteps?.length ||
      state.relevantTools?.length,
  )
}

/**
 * Maps the MCP/extension structured state onto the Gemini `SessionDigestShape`.
 * No LLM call — structured state is already bullet-atomic so we pass it through.
 */
export function structuredStateToDigest(
  state: WorkSessionStructuredState,
  summaryShort: string | null,
): SessionDigestShape {
  const summary = normalizeList([state.summary ?? null]).join(" ") || null
  const progress = normalizeTextValue(state.progress)
  const objective = normalizeTextValue(state.currentObjective)

  const short =
    normalizeTextValue(summaryShort) ??
    progress ??
    summary ??
    objective ??
    state.decisions?.[0] ??
    state.nextSteps?.[0] ??
    "Session checkpoint"

  return {
    summaryShort: short,
    newDecisions: normalizeList(state.decisions),
    newConstraints: normalizeList(state.constraints),
    newTasks: normalizeList(state.nextSteps),
    projectOverviewDelta: null,
    currentObjectiveDelta: objective,
    recentProgressDelta: progress,
    relevantToolsDelta: normalizeList(state.relevantTools),
    importanceScore: 0.5,
    shouldMerge: true,
  }
}

function readStructuredStateFromRow(row: WorkSessionRow): WorkSessionStructuredState {
  return (row.latestStructuredState ?? {}) as WorkSessionStructuredState
}

async function runDigestAndReconcile(
  tx: RepositoryBundle,
  projectId: string,
  project: ProjectRow,
  currentState: ProjectStateRow | null,
  digest: SessionDigestShape,
  flushUserId: string,
  flushSurface: string | null,
  workSessionId: string,
  truthMaintenanceArchive: TruthMaintenanceArchiveDecision[] = [],
): Promise<{ nextState: ProjectStateRow; reconciliation: ReconciliationResult }> {
  const nextStateShape = mergeDigestIntoState(project, currentState, digest)
  const nextState = await tx.projectState.upsert({
    projectId,
    projectOverview: nextStateShape.projectOverview,
    currentObjective: nextStateShape.currentObjective,
    recentProgress: nextStateShape.recentProgress,
    stackDomain: nextStateShape.stackDomain,
    decisions: nextStateShape.decisions,
    constraints: nextStateShape.constraints,
    openTasks: nextStateShape.openTasks,
    relevantTools: nextStateShape.relevantTools,
    objectiveHistory: nextStateShape.objectiveHistory,
    dirty: false,
    lastBootstrapAt: nextStateShape.lastBootstrapAt,
  })

  const reconciliation = await reconcileAfterDigest(tx, projectId, digest, {
    userId: flushUserId,
    sourceSurface: flushSurface,
    truthMaintenanceArchive,
  })
  await observeAndReflectDigestWithRepositories(tx, flushUserId, {
    projectId,
    digest,
    sourceId: workSessionId,
    sourceKind: "work_session",
    observedAt: new Date().toISOString(),
    nextState,
  })
  return { nextState, reconciliation }
}

/**
 * Flush a work session through the digest + reconcile pipeline and close it.
 *
 * Idempotent: calling on an already-closed session is a no-op.
 * Safe to call from:
 *   - Explicit `save_context` / `checkpoint_context` MCP tool.
 *   - Client-side hooks (for example Claude Code, Gemini CLI, or Windsurf).
 *   - Opportunistic server-side sweep at the head of MCP requests.
 */
export async function flushWorkSession(
  userId: string,
  projectId: string,
  input: FlushWorkSessionInput,
): Promise<FlushWorkSessionResult> {
  const repositories = createRepositoryBundle(userId)
  let truthMaintenanceArchive: TruthMaintenanceArchiveDecision[] = []

  const preflightSession = await repositories.workSessions.getById(input.sessionId)
  if (
    preflightSession &&
    preflightSession.projectId === projectId &&
    preflightSession.userId === userId &&
    preflightSession.status !== "closed"
  ) {
    const stateToUse: WorkSessionStructuredState = input.structuredState
      ? input.structuredState
      : readStructuredStateFromRow(preflightSession)

    if (hasMeaningfulState(stateToUse)) {
      const digest = structuredStateToDigest(stateToUse, input.summaryShort ?? null)
      truthMaintenanceArchive = await runTruthMaintenancePass(repositories, userId, {
        projectId,
        digest,
        rawContext: JSON.stringify(stateToUse),
      })
    }
  }

  const result = await repositories.provider.transaction(async (provider) => {
    const tx = createRepositoryBundle(userId, provider)

    const session = await tx.workSessions.getById(input.sessionId)
    if (!session || session.projectId !== projectId || session.userId !== userId) {
      throw new Error("Work session not found.")
    }

    if (session.status === "closed") {
      return { session, flushed: false, skipReason: "already_closed" as const }
    }

    const stateToUse: WorkSessionStructuredState = input.structuredState
      ? input.structuredState
      : readStructuredStateFromRow(session)

    if (!hasMeaningfulState(stateToUse)) {
      // Close without running pipeline — nothing to reconcile.
      const closed = await tx.workSessions.updateLatestState({
        id: session.id,
        status: "closed",
        endedAt: new Date().toISOString(),
      })
      await tx.workSessionEvents.create({
        workSessionId: session.id,
        projectId,
        userId,
        eventType: "session_closed",
        payload: { reason: input.reason ?? "explicit", empty: true },
        sourceSurface: session.surface,
        sourceThreadId: session.threadId,
      })
      return {
        session: closed,
        flushed: false,
        skipReason: "no_state" as const,
      }
    }

    const project = await tx.projects.getById(projectId)
    if (!project) throw new Error("Project not found.")

    const currentState = await tx.projectState.getByProject(projectId)
    const digest = structuredStateToDigest(stateToUse, input.summaryShort ?? null)

    const { nextState, reconciliation } = await runDigestAndReconcile(
      tx,
      projectId,
      project,
      currentState,
      digest,
      userId,
      session.surface,
      session.id,
      truthMaintenanceArchive,
    )

    await tx.workSessionEvents.create({
      workSessionId: session.id,
      projectId,
      userId,
      eventType: "session_flushed",
      payload: {
        reason: input.reason ?? "explicit",
        digest,
        reconciliation,
      },
      sourceSurface: session.surface,
      sourceThreadId: session.threadId,
    })

    await tx.workSessionEvents.create({
      workSessionId: session.id,
      projectId,
      userId,
      eventType: "session_closed",
      payload: { reason: input.reason ?? "explicit", summaryShort: digest.summaryShort },
      sourceSurface: session.surface,
      sourceThreadId: session.threadId,
    })

    const closed = await tx.workSessions.updateLatestState({
      id: session.id,
      latestSummary: digest.summaryShort,
      latestStructuredState: stateToUse as Record<string, unknown>,
      status: "closed",
      endedAt: new Date().toISOString(),
    })

    return {
      session: closed,
      flushed: true,
      reconciliation,
      nextState,
    }
  })
  invalidateProjectCache(userId, projectId)
  return result
}

export interface SweepOpenWorkSessionsInput {
  projectId?: string | null
  /** Only flush sessions idle longer than this many milliseconds. 0 = all active. */
  idleMs?: number
  /** Cap on number of sessions to flush in one sweep (default 3). */
  limit?: number
  reason?: string
}

export interface SweepOpenWorkSessionsResult {
  flushedCount: number
  skippedCount: number
  results: FlushWorkSessionResult[]
}

/**
 * Opportunistic sweep: finds stale open work sessions for a user and runs
 * them through the flush pipeline. Used by:
 *   - `relay-flush` CLI helper (called from supported client hooks).
 *   - Opportunistic in-request sweep at the head of MCP stream route.
 */
export async function sweepOpenWorkSessions(
  userId: string,
  input: SweepOpenWorkSessionsInput,
): Promise<SweepOpenWorkSessionsResult> {
  const repositories = createRepositoryBundle(userId)
  const idleMs = Math.max(0, input.idleMs ?? 0)
  const limit = Math.max(1, Math.min(input.limit ?? 3, 25))
  const updatedBefore = idleMs > 0 ? new Date(Date.now() - idleMs).toISOString() : null

  const sessions = await repositories.workSessions.listOpenForUser({
    userId,
    projectId: input.projectId ?? null,
    updatedBefore,
    limit,
  })

  const results: FlushWorkSessionResult[] = []
  let flushedCount = 0
  let skippedCount = 0

  for (const session of sessions) {
    try {
      const result = await flushWorkSession(userId, session.projectId, {
        sessionId: session.id,
        reason: input.reason ?? "sweep",
      })
      if (result.flushed) flushedCount += 1
      else skippedCount += 1
      results.push(result)
    } catch {
      // Best-effort sweep — one bad session must not block the others.
      skippedCount += 1
    }
  }

  return { flushedCount, skippedCount, results }
}
