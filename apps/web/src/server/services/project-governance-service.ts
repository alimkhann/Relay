import { createRepositoryBundle } from "@relay/db"
import type { SessionDigestShape } from "@relay/shared"
import { projectStateOverrideSchema, sessionArchiveSchema } from "@relay/shared"

import { mergeDigestIntoState } from "./project-state-service"
import { BadRequestError, NotFoundError } from "@/server/http/errors"
import { logServerEvent } from "@/server/logging/logger"

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
      objectiveHistory: nextState.objectiveHistory,
      dirty: true
    })

    await logServerEvent({
      level: "info",
      surface: "web-api",
      area: "projects",
      event: "project_state.rebuilt",
      message: "Rebuilt project state from session digests.",
      userId,
      projectId,
      context: {
        result: "rebuilt",
        status: "ready",
      },
    })
  } else {
    await repositories.projectState.clear(projectId)

    await logServerEvent({
      level: "info",
      surface: "web-api",
      area: "projects",
      event: "project_state.rebuilt",
      message: "Cleared project state because no digests were available.",
      userId,
      projectId,
      context: {
        result: "cleared",
        status: "empty",
      },
    })
  }

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

  await logServerEvent({
    level: "info",
    surface: "web-api",
    area: "projects",
    event: "project_state.overrides_updated",
    message: "Updated project state overrides.",
    userId,
    projectId,
  })

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

  if (parsed.archived && session.sourceConversationId) {
    await repositories.memory.archiveByConversationId(projectId, session.sourceConversationId)
  }

  await rebuildProjectState(userId, projectId)

  await logServerEvent({
    level: "info",
    surface: "web-api",
    area: "projects",
    event: parsed.archived ? "project_session.archived" : "project_session.restored",
    message: parsed.archived ? "Archived a project session." : "Restored a project session.",
    userId,
    projectId,
    context: {
      status: parsed.archived ? "archived" : "active",
    },
  })

  return updated
}

export async function clearProjectBriefs(userId: string, projectId: string) {
  const { repositories } = await requireProjectAccess(userId, projectId)
  await repositories.bootstrapPackets.clearProject(projectId)
}

export async function deleteProjectBrief(userId: string, projectId: string, packetId: string) {
  const { repositories } = await requireProjectAccess(userId, projectId)
  const deleted = await repositories.bootstrapPackets.deleteById(projectId, packetId)

  if (!deleted) {
    throw new NotFoundError("Brief not found.")
  }
}

export async function editProjectBrief(userId: string, projectId: string, packetId: string, content: string) {
  const { repositories } = await requireProjectAccess(userId, projectId)

  if (!content.trim()) {
    throw new BadRequestError("Brief content cannot be empty.")
  }

  const packet = await repositories.bootstrapPackets.updateContent({
    projectId,
    packetId,
    content,
    metadataPatch: {
      edited_at: new Date().toISOString(),
      edited_by: userId,
      edited_via: "web_dashboard",
    },
  })

  if (!packet) {
    throw new NotFoundError("Brief not found.")
  }

  return packet
}
