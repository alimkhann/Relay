import { createRepositoryBundle } from "@relay/db"
import { capturePayloadSchema, withCaptureSignature } from "@relay/shared"

import { decideDigestStrategy, enqueueDigestJob, runDigestJobInline } from "./digest-service"
import { getProjectStateStatus } from "./state-status-service"

export async function saveCapture(userId: string, input: unknown) {
  const repositories = createRepositoryBundle(userId)
  const parsed = capturePayloadSchema.parse(input)
  const normalizedInput = withCaptureSignature({
    ...parsed,
    session: {
      ...parsed.session,
      title: parsed.session.title ?? null
    }
  })
  const latestComparable = await repositories.sessions.getLatestComparable(
    normalizedInput.projectId,
    normalizedInput.platform,
    normalizedInput.session.url,
    normalizedInput.session.pageFingerprint
  )
  const isDuplicateCapture = latestComparable?.captureSignature === normalizedInput.session.captureSignature

  if (isDuplicateCapture && latestComparable) {
    return {
      session: latestComparable,
      turns: [],
      digestQueued: false,
      aiJobId: null,
      duplicateSkipped: true,
      stateStatus: await getProjectStateStatus(repositories, normalizedInput.projectId)
    }
  }

  const session = await repositories.sessions.create({
    ...normalizedInput,
    session: {
      ...normalizedInput.session,
      title: normalizedInput.session.title ?? null
    }
  })
  const turns = await repositories.turns.insertDeduped(session.id, parsed.turns)
  await repositories.events.log({
    userId,
    projectId: normalizedInput.projectId,
    sessionId: session.id,
    eventType: "session_captured",
    payload: {
      platform: normalizedInput.platform,
      turnCount: turns.length
    }
  })

  const shouldQueueDigest = latestComparable?.captureSignature !== normalizedInput.session.captureSignature
  let jobId: string | null = null
  let digestStrategy: "skip" | "ai" | "deferred" = "skip"
  let budgetStatus: { aiUsed: number; aiLimit: number; aiRemaining: number; plan: "free" | "pro" } | null = null

  if (shouldQueueDigest && normalizedInput.session.captureSignature) {
    const decision = await decideDigestStrategy(repositories, userId, {
      projectId: normalizedInput.projectId,
      sessionId: session.id
    })
    digestStrategy = decision.strategy
    budgetStatus = decision.budgetStatus ?? null

    if (decision.strategy === "ai") {
      const job = await enqueueDigestJob(userId, {
        projectId: normalizedInput.projectId,
        sessionId: session.id,
        captureSignature: normalizedInput.session.captureSignature
      })
      jobId = job.id
      await runDigestJobInline(repositories, userId, job)
    } else if (decision.strategy === "deferred") {
      const job = await enqueueDigestJob(userId, {
        projectId: normalizedInput.projectId,
        sessionId: session.id,
        captureSignature: normalizedInput.session.captureSignature,
        status: "deferred"
      })
      jobId = job.id
    }
  }

  const stateStatus = await getProjectStateStatus(repositories, normalizedInput.projectId)

  return {
    session,
    turns,
    digestQueued: digestStrategy !== "skip",
    digestStrategy,
    aiJobId: jobId,
    budgetStatus,
    stateStatus
  }
}
