import type { ProjectDashboardDto } from "@relay/shared"

import type { RepositoryBundle } from "./repository-bundle"
import { getProjectSummaries } from "./project-queries"

export async function getProjectDashboard(repositories: RepositoryBundle, ownerId: string, projectId: string): Promise<ProjectDashboardDto | null> {
  const [projectSummary] = (await getProjectSummaries(repositories, ownerId)).filter((project) => project.id === projectId)
  if (!projectSummary) return null

  const [recentSessions, memory, packets] = await Promise.all([
    repositories.sessions.listByProject(projectId),
    repositories.memory.listByProject(projectId),
    repositories.contextPackets.listByProject(projectId)
  ])

  return {
    project: projectSummary,
    recentSessions: recentSessions.map((session) => ({
      id: session.id,
      platform: session.platform,
      title: session.title,
      url: session.url,
      capturedAt: session.capturedAt,
      turnCount:
        repositories.provider.mode === "memory"
          ? repositories.provider.store.turns.filter((turn) => turn.sessionId === session.id).length
          : 0
    })),
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
      targetProfileKey:
        repositories.provider.mode === "memory"
          ? repositories.provider.store.targetProfiles.find((profile) => profile.id === packet.targetProfileId)?.key ?? "unknown"
          : packet.targetProfileId,
      createdAt: packet.createdAt
    }))
  }
}
