import { createRepositoryBundle, type RepositoryBundle } from "@relay/db"
import type {
  AiJobRunRow,
  CreateMemoryItemInput,
  ProjectStateRow,
  RelayInsertedContextMetadata,
  SessionDigestShape,
  SourceSessionRow,
  SourceSurface,
  SourceTurnRow,
} from "@relay/shared"
import { buildCaptureSignature, DECAY_ARCHIVE_THRESHOLD, hasReplacementSignal, isSameTopic, normalizeText, truncateSentence } from "@relay/shared"

import { reconcileAfterDigest, type TruthMaintenanceArchiveDecision } from "./context-reconciliation-service"
import { observeAndReflectDigestWithRepositories } from "./canon-autonomy-service"
import { decomposeBulletWithTraceability } from "./fact-extractor"
import { runContinuityMaintenanceForProjectWithRepositories } from "./continuity-maintenance-service"
import { resolveViewerEntitlements } from "./entitlement-service"
import { describeGeminiError, GEMINI_MODELS, runGeminiJsonWithFallback, type GeminiStage } from "./gemini-service"
import { embedAndRelateItems, emitMemoryEvent } from "./memory-service"
import { mergeDigestIntoState } from "./project-state-service"
import { resolveProjectAiBudget } from "./ai-budget-service"
import { emitAiRequestCompleted } from "./ai-analytics-service"
import { logServerEvent } from "@/server/logging/logger"

interface DigestModelShape extends SessionDigestShape {
  confidence?: number
}

const DIGEST_JOB_TIMEOUT_MINUTES = 5
const DIGEST_INLINE_TIMEOUT_MS = 45_000
const DIGEST_FALLBACK_PLANNED = true
const PROJECT_DRAIN_COOLDOWN_MS = 60_000

const activeProjectDrains = new Map<string, Promise<void>>()
const lastProjectDrainFinishedAt = new Map<string, number>()

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

interface TruthMaintenanceModelShape {
  archive?: Array<{
    id?: string
    reason?: string
  }>
}

export interface DigestJobOutcome {
  status: "completed" | "failed" | "timed_out" | "skipped"
  digestId: string | null
  memoryItemsCreated: number
  errorMessage?: string | null
  reconciliation?: { archivedCount: number; archivedItems: string[] } | null
}

export type DigestExecutionStrategy = "skip" | "ai" | "deferred"

export interface DigestBudgetStatus {
  aiUsed: number
  aiLimit: number
  aiRemaining: number
  plan: "free" | "starter" | "pro"
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

function readInsertedContextMetadata(session: SourceSessionRow): RelayInsertedContextMetadata | null {
  const candidate = session.metadata?.relayInsertedContext
  if (!candidate || typeof candidate !== "object") return null

  const metadata = candidate as Partial<RelayInsertedContextMetadata>
  if (
    (metadata.kind !== "fresh_chat_bootstrap" && metadata.kind !== "quick_continuity") ||
    typeof metadata.insertedContentHash !== "string" ||
    typeof metadata.deltaKind !== "string"
  ) {
    return null
  }

  return {
    kind: metadata.kind,
    packetId: typeof metadata.packetId === "string" ? metadata.packetId : null,
    insertedContentHash: metadata.insertedContentHash,
    deltaKind: metadata.deltaKind,
    rawTurnCount: typeof metadata.rawTurnCount === "number" ? metadata.rawTurnCount : 0,
    filteredTurnCount: typeof metadata.filteredTurnCount === "number" ? metadata.filteredTurnCount : 0,
    assistantOutcome:
      metadata.assistantOutcome === "dropped_ack" ||
      metadata.assistantOutcome === "dropped_overlap" ||
      metadata.assistantOutcome === "kept_novel"
        ? metadata.assistantOutcome
        : "none",
  }
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

function buildTruthMaintenanceContextForSession(session: SourceSessionRow, turns: SourceTurnRow[]) {
  return [
    `Session title: ${session.title ?? "Untitled session"}`,
    `Session platform: ${session.platform}`,
    "Recent turns:",
    summarizeTurns(prepareDigestTurns(turns)),
  ].join("\n\n")
}

export function sanitizeTruthMaintenanceOutput(
  output: TruthMaintenanceModelShape,
  eligibleIds: Set<string>,
): TruthMaintenanceArchiveDecision[] {
  if (!Array.isArray(output.archive)) return []

  const seen = new Set<string>()
  const decisions: TruthMaintenanceArchiveDecision[] = []
  for (const item of output.archive) {
    const id = typeof item.id === "string" ? item.id.trim() : ""
    if (!id || !eligibleIds.has(id) || seen.has(id)) continue
    seen.add(id)
    const reason = normalizeText(String(item.reason ?? "truth_maintenance")).slice(0, 240) || "truth_maintenance"
    decisions.push({ id, reason })
  }

  return decisions
}

export async function runTruthMaintenancePass(
  repositories: RepositoryBundle,
  userId: string,
  input: {
    projectId: string
    digest: DigestModelShape | SessionDigestShape
    rawContext: string
    signal?: AbortSignal
  },
): Promise<TruthMaintenanceArchiveDecision[]> {
  const existingItems = (await repositories.memory.listByProject(input.projectId))
    .filter(
      (item) =>
        !item.isArchived &&
        !item.pinned &&
        (item.type === "decision" || item.type === "constraint" || item.type === "task"),
    )
    .slice(0, 80)

  if (existingItems.length <= 5) return []

  const eligibleIds = new Set(existingItems.map((item) => item.id))
  try {
    const result = await runGeminiJsonWithFallback<TruthMaintenanceModelShape>({
      primaryModel: GEMINI_MODELS.adjudication.primary,
      fallbackModel: GEMINI_MODELS.adjudication.fallback,
      maxInputTokens: GEMINI_MODELS.adjudication.maxInputTokens,
      maxOutputTokens: GEMINI_MODELS.adjudication.maxOutputTokens,
      signal: input.signal,
      systemInstruction: [
        "You are a truth maintenance agent for durable project memory. Return only JSON.",
        "Archive only when new context explicitly reverses, negates, completes, or supersedes an existing memory item.",
        "When in doubt, keep the existing item.",
      ].join(" "),
      prompt: [
        "Given existing memory items, new conversation context, and extracted new digest items, identify existing items that should be archived.",
        "Return JSON exactly in this shape: {\"archive\":[{\"id\":\"...\",\"reason\":\"...\"}]}",
        "Only include IDs from EXISTING MEMORY ITEMS. Do not include pinned or unrelated items.",
        "EXISTING MEMORY ITEMS:",
        JSON.stringify(existingItems.map((item) => ({
          id: item.id,
          type: item.type,
          content: truncateSentence(item.content, 240),
        }))),
        "NEW CONVERSATION CONTEXT:",
        input.rawContext,
        "EXTRACTED NEW ITEMS:",
        JSON.stringify({
          newDecisions: input.digest.newDecisions,
          newConstraints: input.digest.newConstraints,
          newTasks: input.digest.newTasks,
          currentObjectiveDelta: input.digest.currentObjectiveDelta,
          recentProgressDelta: input.digest.recentProgressDelta,
        }),
      ].join("\n\n"),
    })

    const archive = sanitizeTruthMaintenanceOutput(result.data, eligibleIds)
    if (archive.length > 0) {
      await logServerEvent({
        level: "info",
        surface: "web-api",
        area: "digest",
        event: "truth_maintenance.archives_selected",
        message: `Truth maintenance selected ${archive.length} memory item(s) for archival.`,
        userId,
        projectId: input.projectId,
        context: {
          archivedCount: archive.length,
          model: result.actualModel,
          fallbackUsed: result.fallbackUsed,
        },
      }).catch(() => {})
    }

    return archive
  } catch (error) {
    await logServerEvent({
      level: "warn",
      surface: "web-api",
      area: "digest",
      event: "truth_maintenance.skipped",
      message: "Truth maintenance pass failed; continuing without explicit archival.",
      userId,
      projectId: input.projectId,
      error,
    }).catch(() => {})
    return []
  }
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

  // 6. Skip: budget exhausted or low signal — notify user, don't create low-quality digest
  return {
    strategy: "skip",
    reason: "AI budget exhausted. Capture logged but not analyzed.",
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
  const insertedContextMetadata = readInsertedContextMetadata(session)
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
      "- When Relay marks a capture as inserted-context filtered, extract only from the remaining delta turns. Do not recreate the removed brief or continuity packet.",
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
      ...(insertedContextMetadata
        ? [
            `Inserted-context filter metadata: kind=${insertedContextMetadata.kind}; deltaKind=${insertedContextMetadata.deltaKind}; assistantOutcome=${insertedContextMetadata.assistantOutcome}; rawTurnCount=${insertedContextMetadata.rawTurnCount}; filteredTurnCount=${insertedContextMetadata.filteredTurnCount}.`,
            "These turns were pre-filtered after Relay inserted project context. Treat them as the only new information from that exchange.",
          ]
        : []),
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
    truthMaintenanceArchive?: TruthMaintenanceArchiveDecision[]
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

    // Merge when: digest says so, first capture, or digest extracted real content
    const hasDigestContent =
      (input.digest.newDecisions?.length ?? 0) > 0 ||
      (input.digest.newConstraints?.length ?? 0) > 0 ||
      (input.digest.newTasks?.length ?? 0) > 0
    if (input.digest.shouldMerge || !input.projectState || hasDigestContent) {
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

      // Create memory items from digest outputs (decisions, constraints, tasks)
      const digestMemoryItems = await createMemoryItemsFromDigest(tx, userId, {
        projectId: input.projectId,
        digest: input.digest,
        digestId: digest.id,
        session: input.session,
      })

        const reconciliation = await reconcileAfterDigest(tx, input.projectId, input.digest, {
          newItems: digestMemoryItems,
          userId,
          sourceSurface: (input.session.platform as string) ?? null,
          truthMaintenanceArchive: input.truthMaintenanceArchive,
        })
        await observeAndReflectDigestWithRepositories(tx, userId, {
          projectId: input.projectId,
          digest: input.digest,
          sourceId: digest.id,
          sourceKind: "session_digest",
          observedAt: digest.createdAt,
          nextState,
        })
        await runContinuityMaintenanceForProjectWithRepositories(tx, input.projectId)

      // Auto-cleanup: archive expired + decayed items, enforce memory budget
      await tx.memory.archiveExpiredItems(input.projectId)
      await tx.memory.archiveDecayedItems(input.projectId, DECAY_ARCHIVE_THRESHOLD)
      const entitlements = await resolveViewerEntitlements(userId)
      await tx.memory.archiveOverBudget(input.projectId, entitlements.limits.memoryItemsPerProject)

      return { digest, reconciliation, digestMemoryItems }
    }

    return { digest, reconciliation: { archivedCount: 0, archivedItems: [] } }
  })
}

async function createMemoryItemsFromDigest(
  tx: RepositoryBundle,
  userId: string,
  input: {
    projectId: string
    digest: DigestModelShape
    digestId: string
    session: SourceSessionRow
  }
) {
  // Atomic fact decomposition (Mem0-lite): split each bullet into
  // individually-embeddable atomic facts so the reconciler and hybrid search
  // can match/supersede/rank each fact independently. Deterministic — no
  // extra LLM spend.
  const entries: Array<{ content: string; type: "decision" | "constraint" | "task"; parent: string | null }> = []
  const pushDecomposed = (bullet: string, type: "decision" | "constraint" | "task") => {
    const { parent, atoms } = decomposeBulletWithTraceability(bullet)
    if (atoms.length > 1) {
      for (const atom of atoms) entries.push({ content: atom, type, parent })
    } else {
      entries.push({ content: parent, type, parent: null })
    }
  }
  for (const d of input.digest.newDecisions) pushDecomposed(d, "decision")
  for (const c of input.digest.newConstraints) pushDecomposed(c, "constraint")
  for (const t of input.digest.newTasks) pushDecomposed(t, "task")

  if (entries.length === 0) return []

  // Dedup: fetch existing memory items and check for topic-level matches
  const existing = await tx.memory.listByProject(input.projectId)
  const intraBatchSeen = new Set<string>()

  const newItems: CreateMemoryItemInput[] = []
  for (const entry of entries) {
    const intraKey = `${entry.type}:${entry.content.toLowerCase()}`
    if (intraBatchSeen.has(intraKey)) continue
    intraBatchSeen.add(intraKey)

    const sameTypeExisting = existing.filter((m) => m.type === entry.type && !m.isArchived)
    const topicMatch = sameTypeExisting.find((m) => isSameTopic(m.content, entry.content))
    if (topicMatch) {
      if (hasReplacementSignal(entry.content)) {
        await tx.memory.update(topicMatch.id, {
          isArchived: true,
          metadata: { ...(topicMatch.metadata ?? {}), archivedBy: "digest_replaced" },
        })
        void emitMemoryEvent(tx, {
          projectId: input.projectId,
          memoryItemId: topicMatch.id,
          eventType: "archived",
          sourceSurface: (input.session.platform as string) ?? null,
          userId,
          payload: { type: topicMatch.type, reason: "digest_replaced" },
        })
      } else {
        continue
      }
    }
    newItems.push({
      projectId: input.projectId,
      type: entry.type,
      title: entry.content.length > 80 ? entry.content.slice(0, 77) + "..." : entry.content,
      content: entry.content,
      sourceSurface: (input.session.platform as SourceSurface) ?? null,
      sourceConversationId: input.session.sourceConversationId ?? null,
      sourceUrl: input.session.url ?? null,
      capturedAt: new Date().toISOString(),
      derivedFrom: [input.digestId],
      metadata: {
        source: "digest",
        digestId: input.digestId,
        ...(entry.parent ? { parentBullet: entry.parent, atomic: true } : {}),
      },
      tags: entry.parent ? ["digest", "atomic"] : ["digest"],
    })
  }

  if (newItems.length === 0) return []

  const created = await tx.memory.createBatch(userId, newItems)
  console.log(`[digest-service] Created ${created.length} memory items from digest ${input.digestId}`)
  return created
}


async function runDigestJobInternal(
  repositories: RepositoryBundle,
  userId: string,
  job: AiJobRunRow,
  timeoutMs = DIGEST_INLINE_TIMEOUT_MS
): Promise<DigestJobOutcome> {
  const claimedJob = await repositories.aiJobs.markRunningIfRunnable(job.id, job.attempts + 1, ["pending", "timed_out"])
  if (!claimedJob) {
    return {
      status: "skipped",
      digestId: null,
      memoryItemsCreated: 0,
      errorMessage: "Digest job was already claimed by another worker.",
      reconciliation: null,
    }
  }

  job = claimedJob
  const queuedAtMs = new Date(job.createdAt).getTime()
  const runStartedAtMs = Date.now()
  let currentModel: string | null = null
  let currentFallbackUsed = false
  let lastGeminiStage: GeminiStage | null = null
  let finalStatus: Exclude<DigestJobOutcome["status"], "skipped"> | "unknown" = "unknown"
  let failurePhase: string | null = null
  let tokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0
  }

  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(createDigestTimeoutError(timeoutMs)), timeoutMs)

  try {
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
      finalStatus = "completed"
      return {
        status: "completed",
        digestId: existingDigest.id,
        memoryItemsCreated: 0,
        errorMessage: null,
        reconciliation: null
      }
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

    const truthMaintenanceArchive = await runTruthMaintenancePass(repositories, userId, {
      projectId: job.projectId,
      digest: generation.digest,
      rawContext: buildTruthMaintenanceContextForSession(session, turns),
      signal: controller.signal,
    })

    await patchDigestJobStage(repositories, job.id, "merge_state", {
      model: generation.actualModel,
      fallbackUsed: generation.fallbackUsed,
      lastGeminiStage,
      tokenUsage
    })

    const { digest, digestMemoryItems, reconciliation } = await persistDigestResult(repositories, userId, {
      projectId: job.projectId,
      session,
      projectState,
      turns,
      digest: generation.digest,
      signature,
      truthMaintenanceArchive,
    })

    // Fire-and-forget: generate embeddings + detect relations for new memory items
    if (digestMemoryItems?.length) {
      void embedAndRelateItems(digestMemoryItems, repositories)
    }

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

    finalStatus = "completed"
    return {
      status: "completed",
      digestId: digest.id,
      memoryItemsCreated: digestMemoryItems?.length ?? 0,
      errorMessage: null,
      reconciliation
    }
  } catch (error) {
    const geminiError = describeGeminiError(error)
    const failureMessage = geminiError?.message ?? (error instanceof Error ? error.message : "Digest job failed.")
    failurePhase = geminiError?.phase ?? null

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
      finalStatus = "timed_out"
      return {
        status: "timed_out",
        digestId: null,
        memoryItemsCreated: 0,
        errorMessage: failureMessage,
      }
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

    finalStatus = "failed"
    return {
      status: "failed",
      digestId: null,
      memoryItemsCreated: 0,
      errorMessage: failureMessage,
    }
  } finally {
    const currentRunDurationMs = Math.max(0, Date.now() - runStartedAtMs)
    const persistedStatus =
      finalStatus === "unknown"
        ? await repositories.aiJobs.listByProject(job.projectId, {
            jobKind: "session_digest",
            limit: 1,
            statuses: ["completed", "failed", "timed_out", "running", "pending", "deferred"],
          }).then((jobs) => jobs.find((candidate) => candidate.id === job.id)?.status ?? "unknown")
        : finalStatus

    await logServerEvent({
      level: "info",
      surface: "web-api",
      area: "digest",
      event: "digest_job_finished",
      message: "Completed a Relay digest job attempt.",
      userId,
      context: {
        projectId: job.projectId,
        jobId: job.id,
        status: persistedStatus,
        queueDelayMs: Math.max(0, runStartedAtMs - queuedAtMs),
        runDurationMs: currentRunDurationMs,
        model: currentModel,
        fallbackUsed: currentFallbackUsed,
        lastGeminiStage,
      },
    }).catch(() => {})

    if (currentModel) {
      await emitAiRequestCompleted({
        userId,
        projectId: job.projectId,
        sessionId: job.sessionId,
        requestId: null,
        flowId: null,
        operation: "session_digest",
        jobKind: job.jobKind,
        primaryModel: job.primaryModel,
        actualModel: currentModel,
        fallbackUsed: currentFallbackUsed,
        tokenUsage,
        latencyMs: currentRunDurationMs,
        success: persistedStatus === "completed",
        failurePhase,
      })
    }

    clearTimeout(timeoutHandle)
  }
}

export async function runDigestJobInline(
  repositories: RepositoryBundle,
  userId: string,
  job: AiJobRunRow,
  timeoutMs = DIGEST_INLINE_TIMEOUT_MS
) {
  return await runDigestJobInternal(repositories, userId, job, timeoutMs)
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

  const batchStartedAtMs = Date.now()
  let currentModel: string | null = null
  let currentFallbackUsed = false
  let failurePhase: string | null = null
  let batchSucceeded = false
  let tokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  const claimedJobs: AiJobRunRow[] = []

  try {
    const budget = await resolveProjectAiBudget(repositories, userId, projectId)
    if (!budget.aiEligible) return

    // Claim deferred jobs atomically so parallel drains cannot spend on the same batch.
    for (const job of deferredJobs) {
      const claimed = await repositories.aiJobs.markRunningIfRunnable(job.id, job.attempts + 1, ["deferred"])
      if (claimed) claimedJobs.push(claimed)
    }

    if (claimedJobs.length === 0) return

    const [project, projectState] = await Promise.all([
      repositories.projects.getById(projectId),
      repositories.projectState.getByProject(projectId)
    ])

    if (!project) {
      throw new Error("Project not found for batch digest.")
    }

    // Gather turns from all deferred sessions
    const sessionData: Array<{ session: SourceSessionRow; turns: SourceTurnRow[] }> = []
    for (const job of claimedJobs) {
      if (!job.sessionId) continue
      const session = await repositories.sessions.getById(job.sessionId)
      if (!session) continue
      const turns = await repositories.turns.listBySession(session.id)
      sessionData.push({ session, turns })
    }

    if (sessionData.length === 0) {
      for (const job of claimedJobs) {
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
    const truthMaintenanceArchive = await runTruthMaintenancePass(repositories, userId, {
      projectId,
      digest,
      rawContext: sessionSummaries,
      signal: controller.signal,
    })

    const { digestMemoryItems: batchDigestMemoryItems } = await persistDigestResult(repositories, userId, {
      projectId,
      session: lastSession.session,
      projectState,
      turns: lastSession.turns,
      digest,
      signature,
      truthMaintenanceArchive,
    })

    // Fire-and-forget: generate embeddings + detect relations for new memory items
    if (batchDigestMemoryItems?.length) {
      void embedAndRelateItems(batchDigestMemoryItems, repositories)
    }

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
    for (const job of claimedJobs) {
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
    batchSucceeded = true
  } catch (error) {
    failurePhase = describeGeminiError(error)?.phase ?? null
    const failureMessage = error instanceof Error ? error.message : "Batch digest failed."

    for (const job of claimedJobs) {
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
    if (currentModel) {
      await emitAiRequestCompleted({
        userId,
        projectId,
        operation: "batch_session_digest",
        jobKind: "session_digest",
        primaryModel: GEMINI_MODELS.digest.primary,
        actualModel: currentModel,
        fallbackUsed: currentFallbackUsed,
        tokenUsage,
        latencyMs: Math.max(0, Date.now() - batchStartedAtMs),
        success: batchSucceeded,
        failurePhase,
      })
    }
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
  const deferred = await repositories.aiJobs.listByStatuses(["deferred"], limit, "session_digest")
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

export async function drainDigestJobsForProject(
  userId: string,
  projectId: string,
  limit = 2,
  options: { includeDeferred?: boolean } = {},
) {
  const repositories = createRepositoryBundle(userId)
  await repositories.aiJobs.markTimedOutOlderThan("session_digest", DIGEST_JOB_TIMEOUT_MINUTES)

  const runningJobs = await repositories.aiJobs.listByProject(projectId, {
    jobKind: "session_digest",
    statuses: ["running"],
    limit: 1,
  })

  if (runningJobs.length > 0) return

  const priorityJobs = await repositories.aiJobs.listByProject(projectId, {
    jobKind: "session_digest",
    statuses: ["pending", "timed_out"],
    limit,
  })

  for (const job of priorityJobs) {
    await runDigestJobInternal(repositories, userId, job)
  }

  if (options.includeDeferred !== false) {
    const deferredJobs = await repositories.aiJobs.listDeferredByProject(projectId, limit)
    if (deferredJobs.length > 0) {
      await runBatchDigestForProject(repositories, userId, projectId, deferredJobs)
    }
  }
}

export function scheduleDigestDrainForProject(userId: string, projectId: string, limit = 1): void {
  const key = `${userId}:${projectId}`
  if (activeProjectDrains.has(key)) return

  const lastFinishedAt = lastProjectDrainFinishedAt.get(key) ?? 0
  if (Date.now() - lastFinishedAt < PROJECT_DRAIN_COOLDOWN_MS) return

  const promise = drainDigestJobsForProject(userId, projectId, limit, { includeDeferred: false })
    .catch(() => {})
    .finally(() => {
      activeProjectDrains.delete(key)
      lastProjectDrainFinishedAt.set(key, Date.now())
    })

  activeProjectDrains.set(key, promise)
}

export async function listProjectDigestsForUser(userId: string, projectId: string) {
  const repositories = createRepositoryBundle(userId)
  return repositories.sessionDigests.listByProject(projectId)
}
