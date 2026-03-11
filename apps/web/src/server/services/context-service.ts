import { buildContextCompositionInput, createRepositoryBundle, getRankedMemory } from "@relay/db"
import { getFormatter } from "@relay/formatters"
import { composeContextSchema } from "@relay/shared"

export async function composeContextForProject(userId: string, projectId: string, input: unknown) {
  const repositories = createRepositoryBundle(userId)
  const parsed = composeContextSchema.parse(input)
  const baseInput = await buildContextCompositionInput(repositories, projectId, parsed.targetProfileKey)
  const rankedMemory = await getRankedMemory(repositories, projectId)

  if (baseInput.recentSessions.length === 0 && rankedMemory.length === 0) {
    throw new Error("No captured context yet. Capture visible turns or pin memory first.")
  }

  const formatter = getFormatter(parsed.targetProfileKey)
  const content = formatter.format({
    ...baseInput,
    memoryItems: rankedMemory
  })
  const packet = await repositories.contextPackets.create(
    userId,
    projectId,
    baseInput.targetProfile.id,
    {
      content,
      sourceSnapshot: {
        sessionIds: baseInput.recentSessions.map((session) => session.id),
        memoryIds: rankedMemory.map((item) => item.id)
      },
      targetPlatform: baseInput.targetProfile.platform,
      targetProfileKey: parsed.targetProfileKey
    }
  )

  await repositories.events.log({
    userId,
    projectId,
    sessionId: null,
    eventType: "context_composed",
    payload: { targetProfileKey: parsed.targetProfileKey }
  })

  return {
    packet,
    targetProfileKey: parsed.targetProfileKey
  }
}

export async function listContextHistory(userId: string, projectId: string) {
  const repositories = createRepositoryBundle(userId)
  const [packets, targetProfiles] = await Promise.all([
    repositories.contextPackets.listByProject(projectId),
    repositories.targetProfiles.listAll()
  ])
  const targetProfileById = new Map(targetProfiles.map((profile) => [profile.id, profile.key]))

  return packets.map((packet) => ({
    id: packet.id,
    content: packet.content,
    targetProfileKey: targetProfileById.get(packet.targetProfileId) ?? "unknown",
    createdAt: packet.createdAt
  }))
}
