import type { ProjectSummaryDto } from "@relay/shared"

import type { RepositoryBundle } from "./repository-bundle"

export async function getProjectSummaries(repositories: RepositoryBundle, ownerId: string): Promise<ProjectSummaryDto[]> {
  const projects = await repositories.projects.listByOwner(ownerId)

  return Promise.all(
    projects.map(async (project) => {
      const [memoryItems, sessions] = await Promise.all([
        repositories.memory.listByProject(project.id),
        repositories.sessions.listByProject(project.id, { includeArchived: false })
      ])

      return {
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        memoryCount: memoryItems.length,
        sessionCount: sessions.length,
        updatedAt: project.updatedAt
      }
    })
  )
}
