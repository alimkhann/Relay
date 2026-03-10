import { buildContextCompositionInput, createRepositoryBundle, getRankedMemory } from "@relay/db"
import { getFormatter } from "@relay/formatters"
import { composeContextSchema } from "@relay/shared"

export async function composeContextForProject(userId: string, projectId: string, input: unknown) {
  const repositories = createRepositoryBundle()
  const parsed = composeContextSchema.parse(input)
  const baseInput = await buildContextCompositionInput(repositories, projectId, parsed.targetProfileKey)
  const rankedMemory = await getRankedMemory(repositories, projectId)
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

export async function listContextHistory(projectId: string) {
  const repositories = createRepositoryBundle()
  const packets = await repositories.contextPackets.listByProject(projectId)

  if (repositories.provider.mode === "memory") {
    const targetProfiles = repositories.provider.store.targetProfiles

    return packets.map((packet) => ({
      id: packet.id,
      content: packet.content,
      targetProfileKey: targetProfiles.find((profile) => profile.id === packet.targetProfileId)?.key ?? "unknown",
      createdAt: packet.createdAt
    }))
  }

  return packets.map((packet) => ({
    id: packet.id,
    content: packet.content,
    targetProfileKey: packet.targetProfileId,
    createdAt: packet.createdAt
  }))
}
