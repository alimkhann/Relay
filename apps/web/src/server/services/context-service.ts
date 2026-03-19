import { buildContextCompositionInput, createRepositoryBundle } from "@relay/db"
import { composeContextSchema } from "@relay/shared"
import { getFormatter } from "@relay/formatters"

export async function composeContextForProject(userId: string, projectId: string, input: unknown) {
  const parsed = composeContextSchema.parse(input)
  const repositories = createRepositoryBundle(userId)
  const targetProfile = await repositories.targetProfiles.getByKey(parsed.targetProfileKey)
  if (!targetProfile) {
    throw new Error("Target profile not found.")
  }

  const compositionInput = await buildContextCompositionInput(
    repositories,
    projectId,
    parsed.targetProfileKey,
    parsed.since
  )
  const formatter = getFormatter(parsed.targetProfileKey)
  const content = formatter.format(compositionInput)
  const packet = await repositories.contextPackets.create(userId, projectId, targetProfile.id, {
    content,
    sourceSnapshot: {
      targetProfileKey: parsed.targetProfileKey,
      since: parsed.since ?? null,
      generatedAt: new Date().toISOString()
    },
    targetProfileKey: parsed.targetProfileKey,
    targetPlatform: targetProfile.platform
  })

  return { packet, targetProfileKey: parsed.targetProfileKey }
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
