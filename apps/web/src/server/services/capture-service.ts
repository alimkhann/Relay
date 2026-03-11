import { createRepositoryBundle } from "@relay/db"
import { capturePayloadSchema, withCaptureSignature } from "@relay/shared"

import { drainDigestJobs, enqueueDigestJob } from "./digest-service"

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

  if (shouldQueueDigest && normalizedInput.session.captureSignature) {
    const job = await enqueueDigestJob(userId, {
      projectId: normalizedInput.projectId,
      sessionId: session.id,
      captureSignature: normalizedInput.session.captureSignature
    })
    jobId = job.id

    void drainDigestJobs(userId, 2)
  }

  return {
    session,
    turns,
    digestQueued: shouldQueueDigest,
    aiJobId: jobId
  }
}
