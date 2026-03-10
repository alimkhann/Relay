import type { ProjectDashboardDto } from "@relay/shared"

import type { RepositoryBundle } from "./repository-bundle"
import { getProjectSummaries } from "./project-queries"

export async function getProjectDashboard(repositories: RepositoryBundle, ownerId: string, projectId: string): Promise<ProjectDashboardDto | null> {
  const [projectSummary] = (await getProjectSummaries(repositories, ownerId)).filter((project) => project.id === projectId)
  if (!projectSummary) return null

  const [recentSessions, memory, packets, targetProfiles] = await Promise.all([
    repositories.sessions.listByProject(projectId),
    repositories.memory.listByProject(projectId),
    repositories.contextPackets.listByProject(projectId),
    repositories.targetProfiles.listAll()
  ])
  const targetProfileById = new Map(targetProfiles.map((profile) => [profile.id, profile.key]))

  return {
    project: projectSummary,
    recentSessions: await Promise.all(
      recentSessions.map(async (session) => ({
        id: session.id,
        platform: session.platform,
        title: session.title,
        url: session.url,
        capturedAt: session.capturedAt,
        turnCount: (await repositories.turns.listBySession(session.id)).length
      }))
    ),
    memory: memory.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      content: item.content,
      pinned: item.pinned,
      updatedAt: item.updatedAt
    })),
    packets: packets.map((packet) => ({
      id: packet.id,
      content: packet.content,
      targetProfileKey: targetProfileById.get(packet.targetProfileId) ?? "unknown",
      createdAt: packet.createdAt
    }))
  }
}
