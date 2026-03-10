import { createRepositoryBundle, getProjectDashboard, getProjectSummaries } from "@relay/db"
import { projectInputSchema, slugify, updateProjectSchema } from "@relay/shared"

export async function listProjectsForUser(userId: string) {
  const repositories = createRepositoryBundle()
  return getProjectSummaries(repositories, userId)
}

export async function getProjectDashboardForUser(userId: string, projectId: string) {
  const repositories = createRepositoryBundle()
  return getProjectDashboard(repositories, userId, projectId)
}

export async function createProjectForUser(userId: string, input: unknown) {
  const repositories = createRepositoryBundle()
  const parsed = projectInputSchema.parse(input)
  const project = await repositories.projects.create({
    ownerId: userId,
    name: parsed.name,
    slug: slugify(parsed.slug || parsed.name),
    description: parsed.description ?? null
  })

  await repositories.members.ensureOwner(project.id, userId)
  return project
}

export async function updateProjectForUser(projectId: string, input: unknown) {
  const repositories = createRepositoryBundle()
  const parsed = updateProjectSchema.parse(input)
  return repositories.projects.update(projectId, {
    name: parsed.name,
    slug: parsed.slug ? slugify(parsed.slug) : undefined,
    description: parsed.description,
    isArchived: undefined
  })
}
