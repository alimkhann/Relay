import { createRepositoryBundle, getProjectDashboard, getProjectSummaries } from "@relay/db"
import { projectInputSchema, slugify, updateProjectSchema } from "@relay/shared"

import { BadRequestError } from "@/server/http/errors"
import { logServerEvent } from "@/server/logging/logger"
import { resolveViewerEntitlements } from "./entitlement-service"
import { completeOnboardingForUser } from "./onboarding-service"
import { resolveProjectAiBudget } from "./ai-budget-service"

const PROJECT_SLUG_MAX_LENGTH = 80

function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
  )
}

function buildProjectSlugCandidate(baseSlug: string, attempt: number) {
  if (attempt === 0) return baseSlug

  const suffix = `-${attempt + 1}`
  return `${baseSlug.slice(0, Math.max(2, PROJECT_SLUG_MAX_LENGTH - suffix.length))}${suffix}`
}

export async function listProjectsForUser(userId: string) {
  const repositories = createRepositoryBundle(userId)
  return getProjectSummaries(repositories, userId)
}

export async function getProjectDashboardForUser(userId: string, projectId: string) {
  const repositories = createRepositoryBundle(userId)
  const dashboard = await getProjectDashboard(repositories, userId, projectId)
  if (!dashboard) return null

  return {
    ...dashboard,
    aiBudget: await resolveProjectAiBudget(repositories, userId, projectId)
  }
}

export async function createProjectForUser(
  userId: string,
  input: unknown,
  options: { onboardingVia?: "web" | "extension" } = {}
) {
  const repositories = createRepositoryBundle(userId)
  const entitlements = await resolveViewerEntitlements(userId)
  const parsed = projectInputSchema.parse(input)
  const baseSlug = slugify(parsed.slug ?? parsed.name)

  if (baseSlug.length < 2) {
    await logServerEvent({
      level: "warn",
      surface: "web-api",
      area: "projects",
      event: "project.create.invalid_slug",
      message: "Project creation rejected because the generated slug was too short.",
      userId,
      context: {
        name: parsed.name
      }
    })
    throw new BadRequestError("Project name needs at least two letters or numbers.")
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidateSlug = buildProjectSlugCandidate(baseSlug, attempt)

    try {
      const guardedProject = await repositories.projects.createIfUnderActiveLimit({
        ownerId: userId,
        name: parsed.name,
        slug: candidateSlug,
        description: parsed.description ?? null,
        activeProjectLimit: entitlements.limits.activeProjects,
      })

      if (!guardedProject) {
        throw new BadRequestError("Project limit reached for your current plan.")
      }

      await repositories.members.ensureOwner(guardedProject.id, userId)
      await completeOnboardingForUser(userId, guardedProject.id, options.onboardingVia ?? "web")
      await logServerEvent({
        level: "info",
        surface: "web-api",
        area: "projects",
        event: "project.create.succeeded",
        message: `Created project ${guardedProject.id}.`,
        userId,
        projectId: guardedProject.id,
        context: {
          slug: guardedProject.slug,
          attempt
        }
      })
      return guardedProject
    } catch (error) {
      if (isUniqueViolation(error)) {
        continue
      }

      await logServerEvent({
        level: "error",
        surface: "web-api",
        area: "projects",
        event: "project.create.failed",
        message: "Project creation failed before persistence completed.",
        userId,
        context: {
          slug: candidateSlug
        },
        error
      })
      throw error
    }
  }

  await logServerEvent({
    level: "error",
    surface: "web-api",
    area: "projects",
    event: "project.create.slug_exhausted",
    message: "Project creation exhausted slug candidates.",
    userId,
    context: {
      baseSlug
    }
  })

  throw new BadRequestError("Unable to allocate a unique project slug.")
}

export async function updateProjectForUser(userId: string, projectId: string, input: unknown) {
  const repositories = createRepositoryBundle(userId)
  const entitlements = await resolveViewerEntitlements(userId)
  const parsed = updateProjectSchema.parse(input)
  const slug = parsed.slug ? slugify(parsed.slug) : undefined

  if (typeof slug === "string" && slug.length < 2) {
    throw new BadRequestError("Project slug needs at least two letters or numbers.")
  }

  if (parsed.isArchived === false) {
    const unarchived = await repositories.projects.updateArchiveStateWithLimit({
      id: projectId,
      isArchived: false,
      activeProjectLimit: entitlements.limits.activeProjects,
    })
    if (!unarchived) {
      throw new BadRequestError("Project limit reached for your current plan.")
    }
  }

  return repositories.projects.update(projectId, {
    name: parsed.name,
    slug,
    description: parsed.description,
    isArchived: parsed.isArchived === false ? undefined : parsed.isArchived
  })
}

export async function deleteProjectForUser(userId: string, projectId: string) {
  const repositories = createRepositoryBundle(userId)
  const deleted = await repositories.projects.hardDelete(projectId)
  if (!deleted) {
    throw new BadRequestError("Project not found.")
  }
  console.info("[Relay] project.deleted", { userId, projectId })
}
