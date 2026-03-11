import { createRepositoryBundle } from "@relay/db"
import type { ProjectStateRow, SessionDigestShape, SourceSessionRow, SourceTurnRow } from "@relay/shared"
import { buildCaptureSignature, normalizeText } from "@relay/shared"

import { GEMINI_MODELS, runGeminiJsonWithFallback } from "./gemini-service"
import { mergeDigestIntoState } from "./project-state-service"

interface DigestModelShape extends SessionDigestShape {
  confidence?: number
}

function summarizeTurns(turns: SourceTurnRow[]) {
  return turns
    .slice(-8)
    .map((turn) => `${turn.role.toUpperCase()}: ${normalizeText(turn.content)}`)
    .join("\n")
}

function deterministicDigest(session: SourceSessionRow, turns: SourceTurnRow[], state: ProjectStateRow | null): DigestModelShape {
  const latestUserTurn = [...turns].reverse().find((turn) => turn.role === "user")
  const recentSummary = normalizeText(
    turns
      .slice(-3)
      .map((turn) => turn.content)
      .join(" ")
  ).slice(0, 280)

  const currentObjectiveDelta = latestUserTurn ? normalizeText(latestUserTurn.content).slice(0, 220) : null

  return {
    summaryShort: recentSummary || session.title || "Captured a new session update.",
    newDecisions: [],
    newConstraints: [],
    newTasks: currentObjectiveDelta ? [currentObjectiveDelta] : [],
    projectOverviewDelta: state?.projectOverview ? null : session.title ?? null,
    currentObjectiveDelta,
    recentProgressDelta: recentSummary || null,
    relevantToolsDelta: [session.platform],
    importanceScore: Math.min(100, Math.max(turns.length * 12, latestUserTurn ? 40 : 20)),
    shouldMerge: turns.length > 0,
    confidence: turns.length > 0 ? 0.52 : 0.3
  }
}

function sanitizeDigest(input: DigestModelShape): DigestModelShape {
  const normalizeList = (value: unknown) =>
    Array.isArray(value) ? value.map((item) => normalizeText(String(item))).filter(Boolean).slice(0, 8) : []

  return {
    summaryShort: normalizeText(String(input.summaryShort ?? "")).slice(0, 320) || "Captured a project update.",
    newDecisions: normalizeList(input.newDecisions),
    newConstraints: normalizeList(input.newConstraints),
    newTasks: normalizeList(input.newTasks),
    projectOverviewDelta: input.projectOverviewDelta ? normalizeText(String(input.projectOverviewDelta)).slice(0, 400) : null,
    currentObjectiveDelta: input.currentObjectiveDelta ? normalizeText(String(input.currentObjectiveDelta)).slice(0, 280) : null,
    recentProgressDelta: input.recentProgressDelta ? normalizeText(String(input.recentProgressDelta)).slice(0, 400) : null,
    relevantToolsDelta: normalizeList(input.relevantToolsDelta),
    importanceScore: Math.max(0, Math.min(100, Number(input.importanceScore ?? 0))),
    shouldMerge: Boolean(input.shouldMerge),
    confidence: Math.max(0, Math.min(1, Number(input.confidence ?? 0.65)))
  }
}

async function generateDigest(session: SourceSessionRow, turns: SourceTurnRow[], projectState: ProjectStateRow | null, projectDescription: string | null) {
  const fallback = deterministicDigest(session, turns, projectState)

  try {
    const result = await runGeminiJsonWithFallback<DigestModelShape>({
      primaryModel: GEMINI_MODELS.digest.primary,
      fallbackModel: GEMINI_MODELS.digest.fallback,
      maxInputTokens: GEMINI_MODELS.digest.maxInputTokens,
      maxOutputTokens: GEMINI_MODELS.digest.maxOutputTokens,
      systemInstruction:
        "You compress AI chat activity into a project-state digest. Return only JSON. Prefer concise, durable carry-forward state over transcript details.",
      prompt: [
        "Return a JSON object with these keys exactly:",
        "summaryShort, newDecisions, newConstraints, newTasks, projectOverviewDelta, currentObjectiveDelta, recentProgressDelta, relevantToolsDelta, importanceScore, shouldMerge, confidence.",
        "Use short strings. Arrays should contain only durable carry-forward items.",
        `Project description: ${projectDescription ?? "None provided."}`,
        `Existing project overview: ${projectState?.projectOverview ?? "None."}`,
        `Existing current objective: ${projectState?.currentObjective ?? "None."}`,
        `Existing decisions: ${(projectState?.decisions ?? []).join(" | ") || "None."}`,
        `Existing constraints: ${(projectState?.constraints ?? []).join(" | ") || "None."}`,
        `Existing open tasks: ${(projectState?.openTasks ?? []).join(" | ") || "None."}`,
        `Session title: ${session.title ?? "Untitled session"}`,
        `Session platform: ${session.platform}`,
        "Recent turns:",
        summarizeTurns(turns)
      ].join("\n\n")
    })

    return {
      digest: sanitizeDigest(result.data),
      primaryModel: result.primaryModel,
      actualModel: result.actualModel,
      fallbackUsed: result.fallbackUsed,
      tokenUsage: result.tokenUsage
    }
  } catch {
    return {
      digest: sanitizeDigest(fallback),
      primaryModel: GEMINI_MODELS.digest.primary,
      actualModel: "deterministic",
      fallbackUsed: false,
      tokenUsage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      }
    }
  }
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
    primaryModel: GEMINI_MODELS.digest.primary
  })
}

export async function drainDigestJobs(userId: string, limit = 4) {
  const repositories = createRepositoryBundle(userId)
  const pending = (await repositories.aiJobs.listPending(limit)).filter((job) => job.jobKind === "session_digest")

  for (const job of pending) {
    await repositories.aiJobs.markRunning(job.id, job.attempts + 1)

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
          outputPayload: {
            skipped: true,
            reason: "Digest already exists for this signature."
          }
        })
        continue
      }

      const generation = await generateDigest(session, turns, projectState, project.description)
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
        outputPayload: {
          digestId: digest.id,
          summaryShort: digest.summaryShort
        }
      })
    } catch (error) {
      await repositories.aiJobs.markFailed(job.id, {
        errorClass: error instanceof Error ? error.name : "DigestJobError",
        errorMessage: error instanceof Error ? error.message : "Digest job failed.",
        tokenUsage: {}
      })
    }
  }
}

export async function listProjectDigestsForUser(userId: string, projectId: string) {
  const repositories = createRepositoryBundle(userId)
  return repositories.sessionDigests.listByProject(projectId)
}
