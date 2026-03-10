import { createRepositoryBundle } from "@relay/db"
import { capturePayloadSchema } from "@relay/shared"

export async function saveCapture(userId: string, input: unknown) {
  const repositories = createRepositoryBundle()
  const parsed = capturePayloadSchema.parse(input)
  const session = await repositories.sessions.create({
    ...parsed,
    session: {
      ...parsed.session,
      title: parsed.session.title ?? null
    }
  })
  const turns = await repositories.turns.insertDeduped(session.id, parsed.turns)
  await repositories.events.log({
    userId,
    projectId: parsed.projectId,
    sessionId: session.id,
    eventType: "session_captured",
    payload: {
      platform: parsed.platform,
      turnCount: turns.length
    }
  })

  return {
    session,
    turns
  }
}
