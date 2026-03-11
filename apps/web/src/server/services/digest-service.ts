import { createRepositoryBundle, type RepositoryBundle } from "@relay/db"
import type { AiJobRunRow, ProjectStateRow, SessionDigestShape, SourceSessionRow, SourceTurnRow } from "@relay/shared"
import { buildCaptureSignature, normalizeText } from "@relay/shared"

import { describeGeminiError, GEMINI_MODELS, runGeminiJsonWithFallback, type GeminiStage } from "./gemini-service"
import { mergeDigestIntoState } from "./project-state-service"

interface DigestModelShape extends SessionDigestShape {
  confidence?: number
}

const DIGEST_JOB_TIMEOUT_MINUTES = 5
const DIGEST_INLINE_TIMEOUT_MS = 20_000
const DIGEST_FALLBACK_PLANNED = true

type DigestJobStage = "queued" | GeminiStage | "merge_state" | "completed" | "failed" | "timed_out"

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
  const recentSummary = latestMeaningfulAssistantTurn?.content?.slice(0, 280) ?? null

  const currentObjectiveDelta =
    latestMeaningfulUserTurn && normalizeText(latestMeaningfulUserTurn.content) !== normalizeText(state?.currentObjective ?? "")
      ? normalizeText(latestMeaningfulUserTurn.content).slice(0, 220)
      : null
  const shouldMerge = Boolean(currentObjectiveDelta || recentSummary || !state?.projectOverview)

  return {
    summaryShort: recentSummary || currentObjectiveDelta || session.title || "Captured a new session update.",
    newDecisions: [],
    newConstraints: [],
    newTasks: currentObjectiveDelta ? [currentObjectiveDelta] : [],
    projectOverviewDelta: state?.projectOverview ? null : session.title ?? null,
    currentObjectiveDelta,
    recentProgressDelta: recentSummary,
    relevantToolsDelta: shouldMerge ? [session.platform] : [],
    importanceScore: Math.min(100, Math.max(cleanedTurns.length * 8, latestMeaningfulUserTurn ? 45 : 18)),
    shouldMerge,
    confidence: shouldMerge ? 0.58 : 0.24
  }
}

export function sanitizeDigest(input: DigestModelShape): DigestModelShape {
  const normalizeList = (value: unknown) =>
    Array.isArray(value) ? value.map((item) => normalizeText(String(item))).filter(Boolean).slice(0, 8) : []
  const rawImportanceScore = Number(input.importanceScore ?? 0)
  const normalizedImportanceScore = rawImportanceScore <= 1 ? Math.round(rawImportanceScore * 100) : Math.round(rawImportanceScore)

  return {
    summaryShort: normalizeText(String(input.summaryShort ?? "")).slice(0, 320) || "Captured a project update.",
    newDecisions: normalizeList(input.newDecisions),
    newConstraints: normalizeList(input.newConstraints),
    newTasks: normalizeList(input.newTasks),
    projectOverviewDelta: input.projectOverviewDelta ? normalizeText(String(input.projectOverviewDelta)).slice(0, 400) : null,
    currentObjectiveDelta: input.currentObjectiveDelta ? normalizeText(String(input.currentObjectiveDelta)).slice(0, 280) : null,
    recentProgressDelta: input.recentProgressDelta ? normalizeText(String(input.recentProgressDelta)).slice(0, 400) : null,
    relevantToolsDelta: normalizeList(input.relevantToolsDelta),
    importanceScore: Math.max(0, Math.min(100, normalizedImportanceScore)),
    shouldMerge: Boolean(input.shouldMerge),
    confidence: Math.max(0, Math.min(1, Number(input.confidence ?? 0.65)))
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
    systemInstruction:
      "You compress AI chat activity into a project-state digest. Return only JSON. Prefer concise, durable carry-forward state over transcript details.",
    prompt: [
      "Return a JSON object with these keys exactly:",
      "summaryShort, newDecisions, newConstraints, newTasks, projectOverviewDelta, currentObjectiveDelta, recentProgressDelta, relevantToolsDelta, importanceScore, shouldMerge, confidence.",
      "Use short strings. Arrays should contain only durable carry-forward items.",
      "Ignore trivial meta prompts like 'yes', 'do that', 'continue', or 'what's better?' unless they clearly redefine the project goal.",
      "Ignore transcript wrappers like 'You said:' and 'ChatGPT said:'.",
      `Project description: ${projectDescription ?? "None provided."}`,
      `Existing project overview: ${projectState?.projectOverview ?? "None."}`,
      `Existing current objective: ${projectState?.currentObjective ?? "None."}`,
      `Existing decisions: ${(projectState?.decisions ?? []).join(" | ") || "None."}`,
      `Existing constraints: ${(projectState?.constraints ?? []).join(" | ") || "None."}`,
      `Existing open tasks: ${(projectState?.openTasks ?? []).join(" | ") || "None."}`,
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
}) {
  const repositories = createRepositoryBundle(userId)
  return repositories.aiJobs.create({
    projectId: input.projectId,
    sessionId: input.sessionId,
    createdBy: userId,
    jobKind: "session_digest",
    inputPayload: {
      captureSignature: input.captureSignature
    },
    outputPayload: buildJobProgress("queued"),
    primaryModel: GEMINI_MODELS.digest.primary
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

    const digest = await repositories.sessionDigests.create({
      projectId: job.projectId,
      sourceSessionId: session.id,
      sourceSignature: signature,
      summaryShort: generation.digest.summaryShort,
      structuredDigest: { ...generation.digest },
      confidence: generation.digest.confidence ?? 0.65,
      importanceScore: generation.digest.importanceScore,
      needsProjectStateMerge: generation.digest.shouldMerge,
      createdBy: userId
    })

    if (generation.digest.shouldMerge) {
      const nextState = mergeDigestIntoState(project, projectState, generation.digest)
      await repositories.projectState.upsert({
        projectId: job.projectId,
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
      await repositories.sessionDigests.markMerged(digest.id)
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

export async function drainDigestJobs(userId: string, limit = 4) {
  const repositories = createRepositoryBundle(userId)
  await repositories.aiJobs.markTimedOutOlderThan("session_digest", DIGEST_JOB_TIMEOUT_MINUTES)
  const pending = await repositories.aiJobs.listByStatuses(["pending", "timed_out"], limit, "session_digest")

  for (const job of pending) {
    await runDigestJobInternal(repositories, userId, job)
  }
}

export async function listProjectDigestsForUser(userId: string, projectId: string) {
  const repositories = createRepositoryBundle(userId)
  return repositories.sessionDigests.listByProject(projectId)
}
