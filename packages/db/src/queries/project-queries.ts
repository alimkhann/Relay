import type { ProjectSummaryDto } from "@relay/shared"

import type { RepositoryBundle } from "./repository-bundle"

export async function getProjectSummaries(repositories: RepositoryBundle, ownerId: string): Promise<ProjectSummaryDto[]> {
  const [projects, sessions] = await Promise.all([
    repositories.projects.listByOwner(ownerId),
    Promise.resolve(repositories.provider.mode === "memory" ? repositories.provider.store.sessions : [])
  ])

  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description,
    memoryCount:
      repositories.provider.mode === "memory"
        ? repositories.provider.store.memoryItems.filter((item) => item.projectId === project.id && !item.isArchived).length
        : 0,
    sessionCount:
      repositories.provider.mode === "memory"
        ? sessions.filter((session) => session.projectId === project.id).length
        : 0,
    updatedAt: project.updatedAt
  }))
}
