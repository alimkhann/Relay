import { createRepositoryBundle } from "@relay/db"
import type { SessionDigestShape } from "@relay/shared"
import { projectStateOverrideSchema, sessionArchiveSchema } from "@relay/shared"

import { mergeDigestIntoState } from "./project-state-service"

async function requireProjectAccess(userId: string, projectId: string) {
  const repositories = createRepositoryBundle(userId)
  const project = await repositories.projects.getById(projectId)

  if (!project) {
    throw new Error("Project not found.")
  }

  return { repositories, project }
}

export async function rebuildProjectState(userId: string, projectId: string) {
  const { repositories, project } = await requireProjectAccess(userId, projectId)
  const digests = await repositories.sessionDigests.listByProject(projectId, 500, {
    includeArchived: false,
    ascending: true
  })

  let nextState = null

  for (const digest of digests) {
    nextState = mergeDigestIntoState(
      project,
      nextState,
      digest.structuredDigest as unknown as SessionDigestShape
    )
  }

  if (nextState) {
    await repositories.projectState.upsert({
      projectId,
      projectOverview: nextState.projectOverview,
      currentObjective: nextState.currentObjective,
      stackDomain: nextState.stackDomain,
      recentProgress: nextState.recentProgress,
      decisions: nextState.decisions,
      constraints: nextState.constraints,
      openTasks: nextState.openTasks,
      relevantTools: nextState.relevantTools,
      dirty: true
    })
  } else {
    await repositories.projectState.clear(projectId)
  }

  await repositories.bootstrapPackets.clearProject(projectId)
}

export async function updateProjectStateOverrides(userId: string, projectId: string, input: unknown) {
  const { repositories } = await requireProjectAccess(userId, projectId)
  const parsed = projectStateOverrideSchema.parse(input)

  const overrides = await repositories.projectStateOverrides.upsert({
    projectId,
    projectOverviewOverride: parsed.projectOverviewOverride,
    replaceProjectOverviewOverride: "projectOverviewOverride" in parsed,
    currentObjectiveOverride: parsed.currentObjectiveOverride,
    replaceCurrentObjectiveOverride: "currentObjectiveOverride" in parsed,
    recentProgressOverride: parsed.recentProgressOverride,
    replaceRecentProgressOverride: "recentProgressOverride" in parsed,
    hiddenDecisions: parsed.hiddenDecisions,
    hiddenConstraints: parsed.hiddenConstraints,
    hiddenOpenTasks: parsed.hiddenOpenTasks
  })

  await repositories.bootstrapPackets.clearProject(projectId)

  return overrides
}

export async function archiveProjectSession(
  userId: string,
  projectId: string,
  sessionId: string,
  input: unknown
) {
  const { repositories } = await requireProjectAccess(userId, projectId)
  const parsed = sessionArchiveSchema.parse(input)
  const session = await repositories.sessions.getById(sessionId, {
    includeArchived: true
  })

  if (!session || session.projectId !== projectId) {
    throw new Error("Session not found.")
  }

  const updated = await repositories.sessions.archive(sessionId, userId, parsed.archived)
  await repositories.bootstrapPackets.clearProject(projectId)
  await rebuildProjectState(userId, projectId)
  return updated
}

export async function clearProjectBriefs(userId: string, projectId: string) {
  const { repositories } = await requireProjectAccess(userId, projectId)
  await repositories.bootstrapPackets.clearProject(projectId)
}
