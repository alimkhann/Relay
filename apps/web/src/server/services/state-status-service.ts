import { deriveProjectStateStatus, type ProjectStateStatusDto } from "@relay/shared"
import type { RepositoryBundle } from "@relay/db"

export async function getProjectStateStatus(repositories: RepositoryBundle, projectId: string): Promise<ProjectStateStatusDto> {
  const [sessions, digests, projectState, digestJobs] = await Promise.all([
    repositories.sessions.listByProject(projectId),
    repositories.sessionDigests.listByProject(projectId, 1),
    repositories.projectState.getByProject(projectId),
    repositories.aiJobs.listByProject(projectId, {
      jobKind: "session_digest",
      statuses: ["pending", "running", "failed", "timed_out"],
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
    digestJobs
  })
}
