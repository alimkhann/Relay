import { deriveProjectStateStatus, type ProjectDashboardDto } from "@relay/shared"

import type { RepositoryBundle } from "./repository-bundle"
import { getProjectSummaries } from "./project-queries"

export async function getProjectDashboard(repositories: RepositoryBundle, ownerId: string, projectId: string): Promise<ProjectDashboardDto | null> {
  const [projectSummary] = (await getProjectSummaries(repositories, ownerId)).filter((project) => project.id === projectId)
  if (!projectSummary) return null

  const [recentSessions, memory, packets, legacyPackets, targetProfiles, projectState, recentDigests, digestJobs] = await Promise.all([
    repositories.sessions.listByProject(projectId),
    repositories.memory.listByProject(projectId),
    repositories.bootstrapPackets.listByProject(projectId),
    repositories.contextPackets.listByProject(projectId),
    repositories.targetProfiles.listAll(),
    repositories.projectState.getByProject(projectId),
    repositories.sessionDigests.listByProject(projectId),
    repositories.aiJobs.listByProject(projectId, {
      jobKind: "session_digest",
      statuses: ["pending", "running", "failed", "timed_out"],
      limit: 1
    })
  ])
  const targetProfileById = new Map(targetProfiles.map((profile) => [profile.id, profile.key]))

  return {
    project: projectSummary,
    projectState: projectState
      ? {
          projectOverview: projectState.projectOverview,
          currentObjective: projectState.currentObjective,
          stackDomain: projectState.stackDomain,
          recentProgress: projectState.recentProgress,
          decisions: projectState.decisions,
          constraints: projectState.constraints,
          openTasks: projectState.openTasks,
          relevantTools: projectState.relevantTools,
          lastBootstrapAt: projectState.lastBootstrapAt,
          dirty: projectState.dirty,
        updatedAt: projectState.updatedAt
      }
      : null,
    stateStatus: deriveProjectStateStatus({
      sessions: recentSessions.slice(0, 1),
      digests: recentDigests.slice(0, 1).map((digest) => ({
        createdAt: digest.createdAt
      })),
      projectState: projectState
        ? {
            updatedAt: projectState.updatedAt
          }
        : null,
      digestJobs: digestJobs.map((job) => ({
        status: job.status,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
        completedAt: job.completedAt
      }))
    }),
    recentSessions: await Promise.all(
      recentSessions.map(async (session) => ({
        id: session.id,
        platform: session.platform,
        title: session.title,
        url: session.url,
        capturedAt: session.capturedAt,
        turnCount: (await repositories.turns.listBySession(session.id)).length
      }))
    ),
    recentDigests: recentDigests.map((digest) => ({
      id: digest.id,
      sourceSessionId: digest.sourceSessionId,
      summaryShort: digest.summaryShort,
      confidence: digest.confidence,
      importanceScore: digest.importanceScore,
      shouldMerge: digest.needsProjectStateMerge,
      createdAt: digest.createdAt
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
      kind: packet.kind,
      content: packet.content,
      targetProfileKey: targetProfileById.get(packet.targetProfileId) ?? "unknown",
      renderer: packet.renderer,
      createdAt: packet.createdAt
    })),
    legacyPackets: legacyPackets.map((packet) => ({
      id: packet.id,
      content: packet.content,
      targetProfileKey: targetProfileById.get(packet.targetProfileId) ?? "unknown",
      createdAt: packet.createdAt
    }))
  }
}
