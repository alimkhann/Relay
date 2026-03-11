import { createRepositoryBundle } from "@relay/db"
import { composeContextSchema } from "@relay/shared"

import { generateBootstrapForProject } from "./bootstrap-service"

export async function composeContextForProject(userId: string, projectId: string, input: unknown) {
  const parsed = composeContextSchema.parse(input)
  const packet = await generateBootstrapForProject(userId, projectId, {
    targetProfileKey: parsed.targetProfileKey,
    kind: "fresh_chat_bootstrap"
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
