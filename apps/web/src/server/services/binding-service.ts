import { createRepositoryBundle, getProjectSummaries } from "@relay/db"
import { bindingInputSchema, bindingResolveSchema } from "@relay/shared"

import { logServerEvent } from "@/server/logging/logger"

export async function bindProject(userId: string, input: unknown) {
  const repositories = createRepositoryBundle(userId)
  const parsed = bindingInputSchema.parse(input)
  const binding = await repositories.bindings.bind(userId, parsed)

  await repositories.events.log({
    userId,
    projectId: parsed.projectId,
    sessionId: null,
    eventType: "project_bound",
    payload: parsed as Record<string, unknown>
  })

  return binding
}

export async function resolveBoundProject(userId: string, input: unknown) {
  const repositories = createRepositoryBundle(userId)
  const parsed = bindingResolveSchema.parse(input)
  let binding = null

  try {
    binding = await repositories.bindings.resolve(userId, parsed)
  } catch (error) {
    await logServerEvent({
      level: "warn",
      surface: "web-api",
      area: "bindings",
      event: "extension_binding.resolve_failed",
      message: "Failed to resolve an extension project binding.",
      context: {
        domain: parsed.domain ?? null,
        tabIdPresent: Boolean(parsed.tabId),
        platform: parsed.platform ?? null,
      },
      error,
    })
    throw error
  }

  if (!binding) {
    return null
  }

  const [project, summaries] = await Promise.all([
    repositories.projects.getById(binding.projectId),
    getProjectSummaries(repositories, userId)
  ])

  if (!project) {
    return null
  }

  const summary =
    summaries.find((candidate) => candidate.id === binding.projectId) ?? {
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      memoryCount: 0,
      sessionCount: 0,
      updatedAt: project.updatedAt
    }

  return {
    binding: {
      id: binding.id,
      bindingKind: binding.bindingKind,
      domain: binding.domain,
      tabId: binding.tabId,
      platform: binding.platform,
      updatedAt: binding.updatedAt
    },
    project: summary
  }
}
