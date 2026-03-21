import { createRepositoryBundle, type RepositoryBundle } from "@relay/db"
import type { AiJobRunRow, ProjectStateRow, SessionDigestShape, SourceSessionRow, SourceTurnRow } from "@relay/shared"
import { buildCaptureSignature, normalizeText, truncateSentence } from "@relay/shared"

import { reconcileAfterDigest } from "./context-reconciliation-service"
import { runContinuityMaintenanceForProjectWithRepositories } from "./continuity-maintenance-service"
import { describeGeminiError, GEMINI_MODELS, runGeminiJsonWithFallback, type GeminiStage } from "./gemini-service"
import { mergeDigestIntoState } from "./project-state-service"
import { resolveProjectAiBudget } from "./ai-budget-service"

interface DigestModelShape extends SessionDigestShape {
  confidence?: number
}

const DIGEST_JOB_TIMEOUT_MINUTES = 5
const DIGEST_INLINE_TIMEOUT_MS = 20_000
const DIGEST_FALLBACK_PLANNED = true

type DigestJobStage = "queued" | "deferred" | GeminiStage | "merge_state" | "completed" | "failed" | "timed_out"

interface DigestGenerationResult {
  digest: DigestModelShape
  primaryModel: string
  actualModel: string
  fallbackUsed: boolean
  tokenUsage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  diagnostics?: {
    failurePhase?: string | null
    failureMessage?: string | null
    lastGeminiStage?: GeminiStage | null
  }
}

export type DigestExecutionStrategy = "skip" | "deterministic" | "ai" | "deferred"

export interface DigestBudgetStatus {
  aiUsed: number
  aiLimit: number
  aiRemaining: number
  plan: "free" | "pro"
}

export interface DigestStrategyDecision {
  strategy: DigestExecutionStrategy
  reason: string
  deterministicDigest: DigestModelShape
  budgetStatus?: DigestBudgetStatus
}

function createDigestTimeoutError(timeoutMs: number) {
  const error = new Error(`Digest timed out after ${Math.round(timeoutMs / 1000)} seconds.`)
  error.name = "AbortError"
  return error
}

function isTimeoutError(error: unknown) {
  return error instanceof Error && error.name === "AbortError"
}

function buildJobProgress(stage: DigestJobStage, input: {
  model?: string | null
  fallbackUsed?: boolean
  failurePhase?: string | null
  failureMessage?: string | null
  lastGeminiStage?: GeminiStage | null
  digestId?: string
  summaryShort?: string
  skipped?: boolean
  reason?: string
  batchSize?: number
} = {}) {
  return {
    jobStage: stage,
    fallbackPlanned: DIGEST_FALLBACK_PLANNED,
    fallbackUsed: input.fallbackUsed ?? false,
    model: input.model ?? null,
    failurePhase: input.failurePhase ?? null,
    failureMessage: input.failureMessage ?? null,
    lastGeminiStage: input.lastGeminiStage ?? null,
    digestId: input.digestId,
    summaryShort: input.summaryShort,
    skipped: input.skipped,
    reason: input.reason
  }
}

export function cleanTurnContent(content: string) {
  return normalizeText(content)
    .replace(/^You said:\s*/i, "")
    .replace(/^ChatGPT said:\s*/i, "")
    .replace(/^Claude said:\s*/i, "")
    .replace(/^Codex said:\s*/i, "")
}

export function isLowSignalUserTurn(content: string) {
  const normalized = cleanTurnContent(content).toLowerCase()
  const words = normalized.split(/\s+/).filter(Boolean)

  if (!normalized) return true
  if (normalized.length < 18) return true
  if (words.length <= 4) return true
  if (normalized.includes("your example") || normalized.includes("the info you provided")) return true
  if (normalized.includes("too small") || normalized.includes("too short")) return true
  if (normalized.includes("really short answer")) return true

  return /^(yes|yeah|yep|ok|okay|thanks|thank you|do that|do it|continue|proceed|both|sounds good|what'?s better\b)/i.test(normalized)
}

function findLatestMeaningfulAssistantTurn(turns: SourceTurnRow[]) {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]
    if (!turn || turn.role !== "assistant" || turn.content.length < 80) {
      continue
    }

    const priorUserTurn = [...turns.slice(0, index)].reverse().find((candidate) => candidate.role === "user")
    if (priorUserTurn && !isLowSignalUserTurn(priorUserTurn.content)) {
      return turn
    }
  }

  return [...turns].reverse().find((turn) => turn.role === "assistant" && turn.content.length >= 80) ?? null
}

export function prepareDigestTurns(turns: SourceTurnRow[]) {
  const seen = new Set<string>()

  return turns
    .map((turn) => ({
      ...turn,
      content: cleanTurnContent(turn.content)
    }))
    .filter((turn) => turn.role !== "unknown")
    .filter((turn) => turn.content.length > 0)
    .filter((turn) => {
      const key = `${turn.role}:${turn.content.toLowerCase()}`
      if (seen.has(key)) {
        return false
      }

      seen.add(key)
      return true
    })
}

function summarizeTurns(turns: SourceTurnRow[]) {
  return prepareDigestTurns(turns)
    .slice(-10)
    .map((turn) => `${turn.role.toUpperCase()}: ${turn.content}`)
    .join("\n")
}

export function deterministicDigest(session: SourceSessionRow, turns: SourceTurnRow[], state: ProjectStateRow | null): DigestModelShape {
  const cleanedTurns = prepareDigestTurns(turns)
  const latestMeaningfulUserTurn = [...cleanedTurns]
    .reverse()
    .find((turn) => turn.role === "user" && !isLowSignalUserTurn(turn.content))
  const latestMeaningfulAssistantTurn = findLatestMeaningfulAssistantTurn(cleanedTurns)
  const recentSummary = latestMeaningfulAssistantTurn?.content
    ? truncateSentence(latestMeaningfulAssistantTurn.content, 280)
    : null

  // Deterministic digests must NEVER merge into project state.
  // They only log that the session was captured — no overview, no tasks, no state changes.
  // If first state or budget blocked, the strategy decision routes to AI or deferred instead.
  return {
    summaryShort: recentSummary || session.title || "Captured a new session update.",
    newDecisions: [],
    newConstraints: [],
    newTasks: [],
    projectOverviewDelta: null,
    currentObjectiveDelta: null,
    recentProgressDelta: recentSummary,
    relevantToolsDelta: [],
    importanceScore: Math.min(100, Math.max(cleanedTurns.length * 8, latestMeaningfulUserTurn ? 45 : 18)),
    shouldMerge: false,
    confidence: 0.24
  }
}

export function sanitizeDigest(input: DigestModelShape): DigestModelShape {
  const normalizeList = (value: unknown) =>
    Array.isArray(value) ? value.map((item) => normalizeText(String(item))).filter(Boolean).slice(0, 8) : []
  const rawImportanceScore = Number(input.importanceScore ?? 0)
  const normalizedImportanceScore = rawImportanceScore <= 1 ? Math.round(rawImportanceScore * 100) : Math.round(rawImportanceScore)

  return {
    summaryShort: truncateSentence(normalizeText(String(input.summaryShort ?? "")), 320) || "Captured a project update.",
    newDecisions: normalizeList(input.newDecisions),
    newConstraints: normalizeList(input.newConstraints),
    newTasks: normalizeList(input.newTasks),
    projectOverviewDelta: input.projectOverviewDelta ? truncateSentence(normalizeText(String(input.projectOverviewDelta)), 400) : null,
    currentObjectiveDelta: input.currentObjectiveDelta ? truncateSentence(normalizeText(String(input.currentObjectiveDelta)), 280) : null,
    recentProgressDelta: input.recentProgressDelta ? truncateSentence(normalizeText(String(input.recentProgressDelta)), 400) : null,
    relevantToolsDelta: normalizeList(input.relevantToolsDelta),
    importanceScore: Math.max(0, Math.min(100, normalizedImportanceScore)),
    shouldMerge: Boolean(input.shouldMerge),
    confidence: Math.max(0, Math.min(1, Number(input.confidence ?? 0.65)))
  }
}

function countDigestSignals(digest: DigestModelShape) {
  return [
    digest.projectOverviewDelta,
    digest.currentObjectiveDelta,
    digest.recentProgressDelta,
    ...digest.newDecisions,
    ...digest.newConstraints,
    ...digest.newTasks
  ].filter(Boolean).length
}

export async function decideDigestStrategy(
  repositories: RepositoryBundle,
  userId: string,
  input: {
    projectId: string
    sessionId: string
  }
): Promise<DigestStrategyDecision> {
  const session = await repositories.sessions.getById(input.sessionId)
  if (!session) {
    throw new Error("Session not found for digest strategy.")
  }

  const [project, turns, projectState, digests, budget] = await Promise.all([
    repositories.projects.getById(input.projectId),
    repositories.turns.listBySession(input.sessionId),
    repositories.projectState.getByProject(input.projectId),
    repositories.sessionDigests.listByProject(input.projectId, 10),
    resolveProjectAiBudget(repositories, userId, input.projectId)
  ])

  if (!project) {
    throw new Error("Project not found for digest strategy.")
  }

  const deterministic = deterministicDigest(session, turns, projectState)
  const meaningfulUserTurns = prepareDigestTurns(turns).filter(
    (turn) => turn.role === "user" && !isLowSignalUserTurn(turn.content)
  ).length
  const signalCount = countDigestSignals(deterministic)
  const firstState = !projectState && digests.length === 0
  const staleState = Boolean(
    projectState?.lastBootstrapAt &&
      new Date(projectState.lastBootstrapAt).getTime() <
        Date.now() - 12 * 60 * 60 * 1000
  )
  const majorUpdate = deterministic.importanceScore >= 78 || signalCount >= 3

  // 1. Skip: no turns or truly low-signal
  if (turns.length === 0 || (meaningfulUserTurns === 0 && deterministic.importanceScore < 28)) {
    return {
      strategy: "skip",
      reason: "Capture is too low-signal to justify a digest.",
      deterministicDigest: deterministic
    }
  }

  // 2. Skip: low importance and not first state
  if (deterministic.importanceScore < 42 && !firstState) {
    return {
      strategy: "skip",
      reason: "Capture changed too little to affect project state.",
      deterministicDigest: deterministic
    }
  }

  const budgetStatus: DigestBudgetStatus = {
    aiUsed: budget.dailyProjectAiUsed,
    aiLimit: budget.dailyProjectAiLimit,
    aiRemaining: budget.dailyProjectAiRemaining,
    plan: budget.plan,
  }

  // 3. AI (priority): first/stale/major update with budget available
  if ((firstState || staleState || majorUpdate) && budget.aiEligible) {
    return {
      strategy: "ai",
      reason: firstState
        ? "AI is needed to establish the first durable project state."
        : staleState
          ? "AI is refreshing a stale project state."
          : "AI is justified for a major project update.",
      deterministicDigest: deterministic,
      budgetStatus
    }
  }

  // 4. AI (budget available): use AI generously when budget allows (score >= 28)
  if (budget.aiEligible && deterministic.importanceScore >= 28) {
    return {
      strategy: "ai",
      reason: "AI is allowed for a meaningful project update.",
      deterministicDigest: deterministic,
      budgetStatus
    }
  }

  // 5. Deferred: budget blocked but capture has signal worth processing later
  if (!budget.aiEligible && (firstState || staleState || majorUpdate || deterministic.importanceScore >= 42)) {
    return {
      strategy: "deferred",
      reason: budget.reason ?? "AI digest budget is unavailable, deferring for batch processing.",
      deterministicDigest: deterministic,
      budgetStatus
    }
  }

  // 6. Deterministic: log-only record, no state merge
  return {
    strategy: "deterministic",
    reason: "Logged session without state changes (low signal or budget exhausted).",
    deterministicDigest: deterministic,
    budgetStatus
  }
}

async function generateDigest(
  session: SourceSessionRow,
  turns: SourceTurnRow[],
  projectState: ProjectStateRow | null,
  projectDescription: string | null,
  input: {
    signal?: AbortSignal
    onStage?: (stage: GeminiStage, details: { model: string; fallbackUsed: boolean }) => void | Promise<void>
  } = {}
) {
  const cleanedTurns = prepareDigestTurns(turns)
  const result = await runGeminiJsonWithFallback<DigestModelShape>({
    primaryModel: GEMINI_MODELS.digest.primary,
    fallbackModel: GEMINI_MODELS.digest.fallback,
    maxInputTokens: GEMINI_MODELS.digest.maxInputTokens,
    maxOutputTokens: GEMINI_MODELS.digest.maxOutputTokens,
    signal: input.signal,
    onStage: input.onStage,
    systemInstruction: [
      "You compress AI chat activity into a project-state digest. Return only JSON.",
      "CRITICAL RULES:",
      "- Never store raw user or assistant messages as items. Always synthesize into concise, actionable statements.",
      "- Every item in newDecisions, newConstraints, newTasks must be a self-contained statement understandable without the conversation.",
      "- projectOverviewDelta must describe what the project IS, not repeat the session title.",
      "- currentObjectiveDelta must be a clear goal statement, not raw chat text or file names.",
      "- Ignore file upload names, UI artifacts, system metadata, and garbled text.",
      "- Prefer concise, durable carry-forward state over transcript details.",
    ].join(" "),
    prompt: [
      "Return a JSON object with these keys exactly:",
      "summaryShort, newDecisions, newConstraints, newTasks, projectOverviewDelta, currentObjectiveDelta, recentProgressDelta, relevantToolsDelta, importanceScore, shouldMerge, confidence.",
      "Use short strings. Arrays should contain only durable carry-forward items — never raw quotes or conversation excerpts.",
      "BAD task: 'btw, what if during onboarding i say that we auto capture by default' — raw user message, not a task.",
      "GOOD task: 'Evaluate auto-capture default ON vs OFF for onboarding flow.'",
      "BAD task: 'Progress: Short answer: don't do that' — raw AI response, not a task.",
      "GOOD decision: 'Default auto-capture to OFF during onboarding to comply with platform policies.'",
      "Ignore trivial meta prompts like 'yes', 'do that', 'continue', or 'what's better?' unless they clearly redefine the project goal.",
      "Ignore transcript wrappers like 'You said:' and 'ChatGPT said:'.",
      ...(projectDescription ? [`Project description: ${projectDescription}`] : []),
      ...(projectState?.projectOverview ? [`Existing project overview: ${projectState.projectOverview}`] : []),
      ...(projectState?.currentObjective ? [`Existing current objective: ${projectState.currentObjective}`] : []),
      ...((projectState?.decisions ?? []).length ? [`Existing decisions: ${projectState!.decisions.join(" | ")}`] : []),
      ...((projectState?.constraints ?? []).length ? [`Existing constraints: ${projectState!.constraints.join(" | ")}`] : []),
      ...((projectState?.openTasks ?? []).length ? [`Existing open tasks: ${projectState!.openTasks.join(" | ")}`] : []),
      `Session title: ${session.title ?? "Untitled session"}`,
      `Session platform: ${session.platform}`,
      "Recent turns:",
      summarizeTurns(cleanedTurns)
    ].join("\n\n")
  })

  return {
    digest: sanitizeDigest(result.data),
    primaryModel: result.primaryModel,
    actualModel: result.actualModel,
    fallbackUsed: result.fallbackUsed,
    tokenUsage: result.tokenUsage
  }
}

async function generateDigestWithOptions(
  session: SourceSessionRow,
  turns: SourceTurnRow[],
  projectState: ProjectStateRow | null,
  projectDescription: string | null,
  input: {
    signal?: AbortSignal
    onStage?: (stage: GeminiStage, details: { model: string; fallbackUsed: boolean }) => void | Promise<void>
  } = {}
) {
  return generateDigest(session, turns, projectState, projectDescription, input)
}

export async function enqueueDigestJob(userId: string, input: {
  projectId: string
  sessionId: string
  captureSignature: string
  status?: "pending" | "deferred"
}) {
  const repositories = createRepositoryBundle(userId)
  const isDeferred = input.status === "deferred"
  return repositories.aiJobs.create({
    projectId: input.projectId,
    sessionId: input.sessionId,
    createdBy: userId,
    jobKind: "session_digest",
    status: isDeferred ? "deferred" : "pending",
    inputPayload: {
      captureSignature: input.captureSignature
    },
    outputPayload: buildJobProgress(isDeferred ? "deferred" : "queued"),
    primaryModel: isDeferred ? null : GEMINI_MODELS.digest.primary
  })
}

async function patchDigestJobStage(
  repositories: RepositoryBundle,
  jobId: string,
  stage: DigestJobStage,
  input: {
    model?: string | null
    fallbackUsed?: boolean
    failurePhase?: string | null
    failureMessage?: string | null
    lastGeminiStage?: GeminiStage | null
    digestId?: string
    summaryShort?: string
    skipped?: boolean
    reason?: string
    tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number }
  } = {}
) {
  await repositories.aiJobs.patchProgress(jobId, {
    actualModel: input.model ?? null,
    fallbackUsed: input.fallbackUsed ?? false,
    tokenUsage: input.tokenUsage ?? {},
    outputPayload: buildJobProgress(stage, input)
  })
}

async function persistDigestResult(
  repositories: RepositoryBundle,
  userId: string,
  input: {
    projectId: string
    session: SourceSessionRow
    projectState: ProjectStateRow | null
    turns: SourceTurnRow[]
    digest: DigestModelShape
    signature: string
  }
) {
  return repositories.provider.transaction(async (provider) => {
    const tx = createRepositoryBundle(userId, provider)
    const project = await tx.projects.getById(input.projectId)
    if (!project) {
      throw new Error("Project not found for digest persistence.")
    }

    const digest = await tx.sessionDigests.create({
      projectId: input.projectId,
      sourceSessionId: input.session.id,
      sourceSignature: input.signature,
      summaryShort: input.digest.summaryShort,
      structuredDigest: { ...input.digest },
      confidence: input.digest.confidence ?? 0.65,
      importanceScore: input.digest.importanceScore,
      needsProjectStateMerge: input.digest.shouldMerge,
      createdBy: userId
    })

    const browserSurface = input.session.platform as Parameters<typeof tx.workSessions.create>[0]["surface"]
    const browserThreadId = input.session.sourceConversationId ?? input.session.url
    if (input.session.sourceConversationId && input.session.url && input.session.sourceConversationId !== input.session.url) {
      await tx.workSessions.promoteThreadId({
        projectId: input.projectId,
        surface: browserSurface,
        provisionalThreadId: input.session.url,
        canonicalThreadId: input.session.sourceConversationId,
        clientName: "relay-extension",
      })
    }

    const reusableWorkSession = await tx.workSessions.findReusableActiveSession({
      projectId: input.projectId,
      surface: browserSurface,
      threadId: browserThreadId,
      clientName: "relay-extension",
    })
    const browserWorkSession =
      reusableWorkSession ??
      (await tx.workSessions.create({
        projectId: input.projectId,
        userId,
        surface: browserSurface,
        threadId: browserThreadId,
        clientName: "relay-extension",
        associationMethod: "browser_capture",
        associationConfidence: 0.96,
      }))
    const browserWorkSessionEvent = await tx.workSessionEvents.create({
      workSessionId: browserWorkSession.id,
      projectId: input.projectId,
      userId,
      eventType: "browser_digest_persisted",
      payload: {
        sessionId: input.session.id,
        digestId: digest.id,
        platform: input.session.platform,
        title: input.session.title,
      },
      sourceSurface: browserSurface,
      sourceUrl: input.session.url,
      sourceThreadId: browserThreadId,
    })
    await tx.workSessionCheckpoints.create({
      workSessionId: browserWorkSession.id,
      projectId: input.projectId,
      userId,
      summaryShort: input.digest.summaryShort,
      structuredState: {
        summary: input.digest.summaryShort,
        progress: input.digest.recentProgressDelta,
        currentObjective: input.digest.currentObjectiveDelta,
        decisions: input.digest.newDecisions,
        constraints: input.digest.newConstraints,
        nextSteps: input.digest.newTasks,
        relevantTools: input.digest.relevantToolsDelta,
        notes: input.session.title ? [`Captured from ${input.session.platform}: ${input.session.title}`] : [`Captured from ${input.session.platform}`],
      },
      sourceEventIds: [browserWorkSessionEvent.id],
      confidence: input.digest.confidence ?? 0.65,
    })
    await tx.workSessions.updateLatestState({
      id: browserWorkSession.id,
      latestSummary: input.digest.summaryShort,
      latestStructuredState: {
        summary: input.digest.summaryShort,
        progress: input.digest.recentProgressDelta,
        currentObjective: input.digest.currentObjectiveDelta,
        decisions: input.digest.newDecisions,
        constraints: input.digest.newConstraints,
        nextSteps: input.digest.newTasks,
        relevantTools: input.digest.relevantToolsDelta,
      },
    })

    // Always merge if no project state exists yet (first capture must create initial state)
    if (input.digest.shouldMerge || !input.projectState) {
      const nextState = mergeDigestIntoState(project, input.projectState, input.digest)
      await tx.projectState.upsert({
        projectId: input.projectId,
        projectOverview: nextState.projectOverview,
        currentObjective: nextState.currentObjective,
        stackDomain: nextState.stackDomain,
        recentProgress: nextState.recentProgress,
        decisions: nextState.decisions,
        constraints: nextState.constraints,
        openTasks: nextState.openTasks,
        relevantTools: nextState.relevantTools,
        dirty: nextState.dirty
      })
      await tx.sessionDigests.markMerged(digest.id)

      const reconciliation = await reconcileAfterDigest(tx, input.projectId, input.digest)
      await runContinuityMaintenanceForProjectWithRepositories(tx, input.projectId)
      return { digest, reconciliation }
    }

    return { digest, reconciliation: { archivedCount: 0, archivedItems: [] } }
  })
}

export async function runDeterministicDigestInline(
  repositories: RepositoryBundle,
  userId: string,
  input: {
    projectId: string
    sessionId: string
    captureSignature: string
    digest?: DigestModelShape
    reason?: string
  }
) {
  const session = await repositories.sessions.getById(input.sessionId)
  if (!session) {
    throw new Error("Session not found for deterministic digest.")
  }

  const [project, turns, existingDigest, projectState] = await Promise.all([
    repositories.projects.getById(input.projectId),
    repositories.turns.listBySession(input.sessionId),
    repositories.sessionDigests.getBySessionId(input.sessionId),
    repositories.projectState.getByProject(input.projectId)
  ])

  if (!project) {
    throw new Error("Project not found for deterministic digest.")
  }

  const signature =
    session.captureSignature ??
    input.captureSignature ??
    buildCaptureSignature({
      platform: session.platform,
      url: session.url,
      pageFingerprint: session.pageFingerprint,
      turns: turns.map((turn) => ({
        role: turn.role,
        content: turn.content,
        turnIndex: turn.turnIndex,
        rawHtml: turn.rawHtml
      }))
    })

  const job = await repositories.aiJobs.create({
    projectId: input.projectId,
    sessionId: input.sessionId,
    createdBy: userId,
    jobKind: "session_digest",
    inputPayload: {
      captureSignature: signature,
      strategy: "deterministic"
    }
  })

  await repositories.aiJobs.markRunning(job.id, 1)

  if (existingDigest && existingDigest.sourceSignature === signature) {
    await repositories.aiJobs.markCompleted(job.id, {
      actualModel: "deterministic",
      fallbackUsed: false,
      tokenUsage: {},
      outputPayload: buildJobProgress("completed", {
        model: "deterministic",
        digestId: existingDigest.id,
        summaryShort: existingDigest.summaryShort,
        skipped: true,
        reason: "Digest already exists for this signature."
      })
    })

    return job
  }

  const digestShape = sanitizeDigest(input.digest ?? deterministicDigest(session, turns, projectState))
  // Deterministic digests are log-only: create the session_digest record directly
  // without calling persistDigestResult (which can merge into project state).
  const digest = await repositories.sessionDigests.create({
    projectId: input.projectId,
    sourceSessionId: session.id,
    sourceSignature: signature,
    summaryShort: digestShape.summaryShort,
    structuredDigest: { ...digestShape },
    confidence: digestShape.confidence ?? 0.24,
    importanceScore: digestShape.importanceScore,
    needsProjectStateMerge: false,
    createdBy: userId
  })

  await repositories.aiJobs.markCompleted(job.id, {
    actualModel: "deterministic",
    fallbackUsed: false,
    tokenUsage: {},
    outputPayload: buildJobProgress("completed", {
      model: "deterministic",
      digestId: digest.id,
      summaryShort: digest.summaryShort,
      reason: input.reason
    })
  })

  return job
}

async function runDigestJobInternal(
  repositories: RepositoryBundle,
  userId: string,
  job: AiJobRunRow,
  timeoutMs = DIGEST_INLINE_TIMEOUT_MS
) {
  let currentModel: string | null = null
  let currentFallbackUsed = false
  let lastGeminiStage: GeminiStage | null = null
  let tokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0
  }

  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(createDigestTimeoutError(timeoutMs)), timeoutMs)

  try {
    await repositories.aiJobs.markRunning(job.id, job.attempts + 1)

    const session = job.sessionId ? await repositories.sessions.getById(job.sessionId) : null
    if (!session) {
      throw new Error("Session not found for digest job.")
    }

    const [project, turns, existingDigest, projectState] = await Promise.all([
      repositories.projects.getById(job.projectId),
      repositories.turns.listBySession(session.id),
      repositories.sessionDigests.getBySessionId(session.id),
      repositories.projectState.getByProject(job.projectId)
    ])

    if (!project) {
      throw new Error("Project not found for digest job.")
    }

    const signature =
      session.captureSignature ??
      buildCaptureSignature({
        platform: session.platform,
        url: session.url,
        pageFingerprint: session.pageFingerprint,
        turns: turns.map((turn) => ({
          role: turn.role,
          content: turn.content,
          turnIndex: turn.turnIndex,
          rawHtml: turn.rawHtml
        }))
      })

    if (existingDigest && existingDigest.sourceSignature === signature) {
      await repositories.aiJobs.markCompleted(job.id, {
        actualModel: "skipped",
        fallbackUsed: false,
        tokenUsage: {},
        outputPayload: buildJobProgress("completed", {
          model: "skipped",
          digestId: existingDigest.id,
          summaryShort: existingDigest.summaryShort,
          skipped: true,
          reason: "Digest already exists for this signature."
        })
      })
      return
    }

    const generation = await generateDigestWithOptions(session, turns, projectState, project.description, {
      signal: controller.signal,
      onStage: async (stage, details) => {
        currentModel = details.model
        currentFallbackUsed = details.fallbackUsed
        lastGeminiStage = stage
        await patchDigestJobStage(repositories, job.id, stage, {
          model: details.model,
          fallbackUsed: details.fallbackUsed,
          lastGeminiStage: stage
        })
      }
    })

    currentModel = generation.actualModel
    currentFallbackUsed = generation.fallbackUsed
    tokenUsage = generation.tokenUsage

    await patchDigestJobStage(repositories, job.id, "merge_state", {
      model: generation.actualModel,
      fallbackUsed: generation.fallbackUsed,
      lastGeminiStage,
      tokenUsage
    })

    const { digest } = await persistDigestResult(repositories, userId, {
      projectId: job.projectId,
      session,
      projectState,
      turns,
      digest: generation.digest,
      signature
    })

    await repositories.aiJobs.markCompleted(job.id, {
      actualModel: generation.actualModel,
      fallbackUsed: generation.fallbackUsed,
      tokenUsage: { ...generation.tokenUsage },
      outputPayload: buildJobProgress("completed", {
        model: generation.actualModel,
        fallbackUsed: generation.fallbackUsed,
        lastGeminiStage,
        digestId: digest.id,
        summaryShort: digest.summaryShort
      })
    })
  } catch (error) {
    const geminiError = describeGeminiError(error)
    const failureMessage = geminiError?.message ?? (error instanceof Error ? error.message : "Digest job failed.")
    const failurePhase = geminiError?.phase ?? null

    if (isTimeoutError(error) || controller.signal.aborted) {
      await repositories.aiJobs.markTimedOut(job.id, {
        errorMessage: failureMessage,
        actualModel: currentModel,
        fallbackUsed: currentFallbackUsed,
        tokenUsage,
        outputPayload: buildJobProgress("timed_out", {
          model: currentModel,
          fallbackUsed: currentFallbackUsed,
          failurePhase,
          failureMessage,
          lastGeminiStage
        })
      })
      return
    }

    await repositories.aiJobs.markFailed(job.id, {
      errorClass: error instanceof Error ? error.name : "DigestJobError",
      errorMessage: failureMessage,
      actualModel: currentModel,
      fallbackUsed: currentFallbackUsed,
      tokenUsage,
      outputPayload: buildJobProgress("failed", {
        model: currentModel,
        fallbackUsed: currentFallbackUsed,
        failurePhase,
        failureMessage,
        lastGeminiStage
      })
    })
  } finally {
    clearTimeout(timeoutHandle)
  }
}

export async function runDigestJobInline(
  repositories: RepositoryBundle,
  userId: string,
  job: AiJobRunRow,
  timeoutMs = DIGEST_INLINE_TIMEOUT_MS
) {
  await runDigestJobInternal(repositories, userId, job, timeoutMs)
}

export async function runBatchDigestForProject(
  repositories: RepositoryBundle,
  userId: string,
  projectId: string,
  deferredJobs: AiJobRunRow[],
  timeoutMs = DIGEST_INLINE_TIMEOUT_MS
) {
  if (deferredJobs.length === 0) return

  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(createDigestTimeoutError(timeoutMs)), timeoutMs)

  let currentModel: string | null = null
  let currentFallbackUsed = false
  let tokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

  try {
    // Mark all deferred jobs as running
    for (const job of deferredJobs) {
      await repositories.aiJobs.markRunning(job.id, job.attempts + 1)
    }

    const [project, projectState] = await Promise.all([
      repositories.projects.getById(projectId),
      repositories.projectState.getByProject(projectId)
    ])

    if (!project) {
      throw new Error("Project not found for batch digest.")
    }

    // Gather turns from all deferred sessions
    const sessionData: Array<{ session: SourceSessionRow; turns: SourceTurnRow[] }> = []
    for (const job of deferredJobs) {
      if (!job.sessionId) continue
      const session = await repositories.sessions.getById(job.sessionId)
      if (!session) continue
      const turns = await repositories.turns.listBySession(session.id)
      sessionData.push({ session, turns })
    }

    if (sessionData.length === 0) {
      for (const job of deferredJobs) {
        await repositories.aiJobs.markCompleted(job.id, {
          actualModel: "skipped",
          outputPayload: buildJobProgress("completed", { skipped: true, reason: "No sessions to process." })
        })
      }
      return
    }

    // Build multi-session prompt
    const sessionSummaries = sessionData.map(({ session, turns }, index) => {
      const cleaned = prepareDigestTurns(turns)
      const turnText = cleaned
        .slice(-8)
        .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
        .join("\n")
      return `--- Session ${index + 1}: "${session.title ?? "Untitled"}" (${session.platform}) ---\n${turnText}`
    }).join("\n\n")

    const result = await runGeminiJsonWithFallback<DigestModelShape>({
      primaryModel: GEMINI_MODELS.digest.primary,
      fallbackModel: GEMINI_MODELS.digest.fallback,
      maxInputTokens: GEMINI_MODELS.digest.maxInputTokens,
      maxOutputTokens: GEMINI_MODELS.digest.maxOutputTokens,
      signal: controller.signal,
      systemInstruction: [
        "You compress AI chat activity into a project-state digest. Return only JSON.",
        "You are processing MULTIPLE chat sessions captured for the same project. Synthesize insights from ALL sessions into a single unified digest.",
        "CRITICAL RULES:",
        "- Never store raw user or assistant messages as items. Always synthesize into concise, actionable statements.",
        "- Every item in newDecisions, newConstraints, newTasks must be a self-contained statement understandable without the conversation.",
        "- projectOverviewDelta must describe what the project IS, not repeat session titles.",
        "- currentObjectiveDelta must be a clear goal statement, not raw chat text or file names.",
        "- Ignore file upload names, UI artifacts, system metadata, and garbled text.",
        "- Prefer concise, durable carry-forward state over transcript details.",
      ].join(" "),
      prompt: [
        "Return a JSON object with these keys exactly:",
        "summaryShort, newDecisions, newConstraints, newTasks, projectOverviewDelta, currentObjectiveDelta, recentProgressDelta, relevantToolsDelta, importanceScore, shouldMerge, confidence.",
        "Use short strings. Arrays should contain only durable carry-forward items — never raw quotes or conversation excerpts.",
        "BAD task: 'btw, what if during onboarding i say that we auto capture by default' — raw user message, not a task.",
        "GOOD task: 'Evaluate auto-capture default ON vs OFF for onboarding flow.'",
        ...(project.description ? [`Project description: ${project.description}`] : []),
        ...(projectState?.projectOverview ? [`Existing project overview: ${projectState.projectOverview}`] : []),
        ...(projectState?.currentObjective ? [`Existing current objective: ${projectState.currentObjective}`] : []),
        ...((projectState?.decisions ?? []).length ? [`Existing decisions: ${projectState!.decisions.join(" | ")}`] : []),
        ...((projectState?.constraints ?? []).length ? [`Existing constraints: ${projectState!.constraints.join(" | ")}`] : []),
        ...((projectState?.openTasks ?? []).length ? [`Existing open tasks: ${projectState!.openTasks.join(" | ")}`] : []),
        `\nYou have ${sessionData.length} sessions to process:\n`,
        sessionSummaries
      ].join("\n\n")
    })

    currentModel = result.actualModel
    currentFallbackUsed = result.fallbackUsed
    tokenUsage = result.tokenUsage

    const digest = sanitizeDigest(result.data)

    // Persist digest for each session and merge once at the end
    const lastSession = sessionData[sessionData.length - 1]!
    const signature = lastSession.session.captureSignature ?? `batch-${Date.now()}`

    await persistDigestResult(repositories, userId, {
      projectId,
      session: lastSession.session,
      projectState,
      turns: lastSession.turns,
      digest,
      signature
    })

    // Create digest records for earlier sessions too (so they're marked as processed)
    for (let i = 0; i < sessionData.length - 1; i++) {
      const { session } = sessionData[i]!
      const sessionSignature = session.captureSignature ?? `batch-${session.id}`
      await repositories.sessionDigests.create({
        projectId,
        sourceSessionId: session.id,
        sourceSignature: sessionSignature,
        summaryShort: digest.summaryShort,
        structuredDigest: { ...digest },
        confidence: digest.confidence ?? 0.65,
        importanceScore: digest.importanceScore,
        needsProjectStateMerge: false,
        createdBy: userId
      })
    }

    // Mark all jobs as completed
    for (const job of deferredJobs) {
      await repositories.aiJobs.markCompleted(job.id, {
        actualModel: result.actualModel,
        fallbackUsed: result.fallbackUsed,
        tokenUsage: { ...tokenUsage },
        outputPayload: buildJobProgress("completed", {
          model: result.actualModel,
          fallbackUsed: result.fallbackUsed,
          batchSize: sessionData.length,
          summaryShort: digest.summaryShort
        })
      })
    }
  } catch (error) {
    const failureMessage = error instanceof Error ? error.message : "Batch digest failed."

    for (const job of deferredJobs) {
      if (isTimeoutError(error) || controller.signal.aborted) {
        await repositories.aiJobs.markTimedOut(job.id, {
          errorMessage: failureMessage,
          actualModel: currentModel,
          fallbackUsed: currentFallbackUsed,
          tokenUsage,
          outputPayload: buildJobProgress("timed_out", { failureMessage })
        })
      } else {
        await repositories.aiJobs.markFailed(job.id, {
          errorClass: error instanceof Error ? error.name : "BatchDigestError",
          errorMessage: failureMessage,
          actualModel: currentModel,
          fallbackUsed: currentFallbackUsed,
          tokenUsage,
          outputPayload: buildJobProgress("failed", { failureMessage })
        })
      }
    }
  } finally {
    clearTimeout(timeoutHandle)
  }
}

export async function drainDigestJobs(userId: string, limit = 4) {
  const repositories = createRepositoryBundle(userId)
  await repositories.aiJobs.markTimedOutOlderThan("session_digest", DIGEST_JOB_TIMEOUT_MINUTES)

  // Process pending/timed_out jobs individually (retries)
  const pending = await repositories.aiJobs.listByStatuses(["pending", "timed_out"], limit, "session_digest")
  for (const job of pending) {
    await runDigestJobInternal(repositories, userId, job)
  }

  // Process deferred jobs in batches by project
  const deferred = await repositories.aiJobs.listByStatuses(["deferred"], limit * 2, "session_digest")
  if (deferred.length === 0) return

  const byProject = new Map<string, AiJobRunRow[]>()
  for (const job of deferred) {
    const existing = byProject.get(job.projectId) ?? []
    existing.push(job)
    byProject.set(job.projectId, existing)
  }

  for (const [projectId, jobs] of byProject) {
    await runBatchDigestForProject(repositories, userId, projectId, jobs)
  }
}

export async function listProjectDigestsForUser(userId: string, projectId: string) {
  const repositories = createRepositoryBundle(userId)
  return repositories.sessionDigests.listByProject(projectId)
}
