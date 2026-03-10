import type { ContextCompositionInput } from "@relay/shared"

import type { RepositoryBundle } from "./repository-bundle"

export async function buildContextCompositionInput(
  repositories: RepositoryBundle,
  projectId: string,
  targetProfileKey: string
): Promise<ContextCompositionInput> {
  const [project, targetProfile, recentSessions, memoryItems] = await Promise.all([
    repositories.projects.getById(projectId),
    repositories.targetProfiles.getByKey(targetProfileKey),
    repositories.sessions.listByProject(projectId),
    repositories.memory.listByProject(projectId)
  ])

  if (!project) throw new Error("Project not found")
  if (!targetProfile) throw new Error("Target profile not found")

  return {
    project,
    targetProfile,
    recentSessions: recentSessions.slice(0, 5),
    memoryItems
  }
}
