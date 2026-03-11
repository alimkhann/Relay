import { deriveProjectStateStatus, type ProjectStateStatusDto } from "@relay/shared"
import type { RepositoryBundle } from "@relay/db"

export async function getProjectStateStatus(repositories: RepositoryBundle, projectId: string): Promise<ProjectStateStatusDto> {
  const [sessions, digests, projectState, digestJobs] = await Promise.all([
    repositories.sessions.listByProject(projectId),
    repositories.sessionDigests.listByProject(projectId, 1),
    repositories.projectState.getByProject(projectId),
    repositories.aiJobs.listByProject(projectId, {
      jobKind: "session_digest",
      limit: 1
    })
  ])

  return deriveProjectStateStatus({
    sessions: sessions.slice(0, 1),
    digests,
    projectState: projectState
      ? {
          updatedAt: projectState.updatedAt
        }
      : null,
    digestJobs: digestJobs.map((job) => ({
      id: job.id,
      status: job.status,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      attempts: job.attempts,
      fallbackUsed: job.fallbackUsed,
      outputPayload: job.outputPayload
    }))
  })
}
