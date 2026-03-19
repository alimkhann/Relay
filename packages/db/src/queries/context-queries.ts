import type { ContextCompositionInput } from "@relay/shared"

import type { RepositoryBundle } from "./repository-bundle"

export async function buildContextCompositionInput(
  repositories: RepositoryBundle,
  projectId: string,
  targetProfileKey: string,
  since?: string
): Promise<ContextCompositionInput> {
  const [project, targetProfile, sessions, memoryItems] = await Promise.all([
    repositories.projects.getById(projectId),
    repositories.targetProfiles.getByKey(targetProfileKey),
    repositories.sessions.listByProject(projectId),
    repositories.memory.listByProject(projectId)
  ])

  if (!project) throw new Error("Project not found")
  if (!targetProfile) throw new Error("Target profile not found")

  const sinceTime = since ? new Date(since).getTime() : null
  const filteredSessions = sinceTime
    ? sessions.filter((session) => new Date(session.capturedAt).getTime() >= sinceTime)
    : sessions
  const filteredMemoryItems = sinceTime
    ? memoryItems.filter((item) => new Date(item.updatedAt).getTime() >= sinceTime)
    : memoryItems
  const recentSessions = filteredSessions.slice(0, 5)
  const recentTurns = (
    await Promise.all(
      recentSessions.slice(0, 3).map(async (session) => {
        const turns = await repositories.turns.listBySession(session.id)
        return turns.slice(-3).map((turn) => ({
          sessionId: session.id,
          sessionTitle: session.title,
          platform: session.platform,
          role: turn.role,
          content: turn.content
        }))
      })
    )
  ).flat()

  return {
    project,
    targetProfile,
    recentSessions,
    recentTurns,
    memoryItems: filteredMemoryItems
  }
}
