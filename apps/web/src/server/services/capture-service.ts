import { createRepositoryBundle } from "@relay/db"
import { capturePayloadSchema, withCaptureSignature } from "@relay/shared"

import { decideDigestStrategy, enqueueDigestJob, scheduleDigestDrainForProject, type DigestJobOutcome } from "./digest-service"
import { getProjectStateStatus } from "./state-status-service"
import { fireUserMilestone } from "./user-milestones-service"
import { logServerEvent } from "@/server/logging/logger"

export async function saveCapture(userId: string, input: unknown) {
  const startedAt = Date.now()
  const repositories = createRepositoryBundle(userId)
  const parsed = capturePayloadSchema.parse(input)
  const normalizedInput = withCaptureSignature({
    ...parsed,
    session: {
      ...parsed.session,
      title: parsed.session.title ?? null
    }
  })
  const fastAck = parsed.processingMode === "fast_ack"
  const latestComparable = await repositories.sessions.getLatestComparableByIdentity(
    normalizedInput.projectId,
    normalizedInput.platform,
    {
      url: normalizedInput.session.url,
      pageFingerprint: normalizedInput.session.pageFingerprint,
      sourceConversationId: normalizedInput.session.sourceConversationId
    }
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
  await repositories.bootstrapPackets.clearProject(normalizedInput.projectId)

  const shouldQueueDigest = latestComparable?.captureSignature !== normalizedInput.session.captureSignature
  let jobId: string | null = null
  let digestStrategy: "skip" | "ai" | "deferred" = "skip"
  let budgetStatus: { aiUsed: number; aiLimit: number; aiRemaining: number; plan: "free" | "starter" | "pro" } | null = null
  let digestOutcome: DigestJobOutcome | null = null

  if (shouldQueueDigest && normalizedInput.session.captureSignature) {
    const decision = await decideDigestStrategy(repositories, userId, {
      projectId: normalizedInput.projectId,
      sessionId: session.id
    })
    digestStrategy = decision.strategy
    budgetStatus = decision.budgetStatus ?? null

    if (budgetStatus && budgetStatus.aiRemaining <= 0 && decision.strategy !== "ai") {
      await logServerEvent({
        level: "warn",
        surface: "web-api",
        area: "digest",
        event: "digest_budget_blocked",
        message: "Relay could not run an immediate AI digest because the daily budget was exhausted.",
        userId,
        context: {
          projectId: normalizedInput.projectId,
          sessionId: session.id,
          strategy: decision.strategy,
          aiUsed: budgetStatus.aiUsed,
          aiLimit: budgetStatus.aiLimit,
          plan: budgetStatus.plan,
        },
      }).catch(() => {})
    }

    if (decision.strategy === "ai" && fastAck) {
      const job = await enqueueDigestJob(userId, {
        projectId: normalizedInput.projectId,
        sessionId: session.id,
        captureSignature: normalizedInput.session.captureSignature
      })
      jobId = job.id
      digestStrategy = "deferred"
      scheduleDigestDrainForProject(userId, normalizedInput.projectId, 1)
    } else if (decision.strategy === "ai") {
      const job = await enqueueDigestJob(userId, {
        projectId: normalizedInput.projectId,
        sessionId: session.id,
        captureSignature: normalizedInput.session.captureSignature
      })
      jobId = job.id
      
      const { runDigestJobInline } = await import("./digest-service")
      const inlineOutcome = await runDigestJobInline(repositories, userId, job).catch((error) => {
        return null
      })
      
      if (inlineOutcome) {
        digestOutcome = inlineOutcome
      } else {
        scheduleDigestDrainForProject(userId, normalizedInput.projectId, 1)
      }
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
  await logServerEvent({
    level: "info",
    surface: "web-api",
    area: "capture",
    event: "capture_saved",
    message: "Saved a Relay capture and queued follow-up processing.",
    userId,
    context: {
      projectId: normalizedInput.projectId,
      sessionId: session.id,
      digestStrategy,
      digestQueued: digestStrategy !== "skip",
      jobId,
      duplicateSkipped: false,
      captureSaveAckMs: Math.max(0, Date.now() - startedAt),
      bootstrapPacketsInvalidated: true,
      processingMode: fastAck ? "fast_ack" : "default",
      plan: budgetStatus?.plan ?? null,
    },
  }).catch(() => {})

  const activationRows = await repositories.provider.query<{ count: number }>(
    `select count(*)::int as count
     from capture_events
     where user_id = $1
       and event_type = 'session_captured'`,
    [userId]
  )
  const totalCaptures = Number(activationRows[0]?.count ?? 0)

  if (totalCaptures === 1) {
    void fireUserMilestone(userId, "first_session_captured", {
      project_id: normalizedInput.projectId,
      platform: normalizedInput.platform,
    }).catch(() => {})

    await logServerEvent({
      level: "info",
      surface: "web-api",
      area: "capture",
      event: "activation_completed",
      message: "User completed the first successful Relay capture.",
      userId,
      projectId: normalizedInput.projectId,
      sessionId: session.id,
      context: {
        activationSource: normalizedInput.platform,
        captureCount: totalCaptures,
      },
    }).catch(() => {})
  }

  return {
    session,
    turns,
    digestQueued: digestStrategy !== "skip",
    digestStrategy,
    aiJobId: jobId,
    digestOutcome,
    budgetStatus,
    stateStatus,
    reconciliation: digestOutcome?.reconciliation ?? null
  }
}
