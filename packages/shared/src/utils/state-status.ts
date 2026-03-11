import type { AiJobRunRow, SourceSessionRow } from "../types/database"
import type { ProjectStateDto, ProjectStateStatusDto, SessionDigestDto } from "../types/project"

interface DeriveProjectStateStatusInput {
  sessions: Array<Pick<SourceSessionRow, "capturedAt">>
  digests: Array<Pick<SessionDigestDto, "createdAt">>
  projectState: Pick<ProjectStateDto, "updatedAt"> | null
  digestJobs: Array<Pick<AiJobRunRow, "status" | "errorMessage" | "createdAt" | "completedAt">>
}

export function deriveProjectStateStatus(input: DeriveProjectStateStatusInput): ProjectStateStatusDto {
  const latestSession = input.sessions[0] ?? null
  const latestDigest = input.digests[0] ?? null
  const latestJob = input.digestJobs[0] ?? null
  const rawCapturePresent = input.sessions.length > 0
  const projectStateReady = Boolean(input.projectState)

  let digestStatus: ProjectStateStatusDto["digestStatus"] = "idle"
  if (projectStateReady || latestDigest) {
    digestStatus = "completed"
  } else if (latestJob) {
    digestStatus = latestJob.status
  } else if (rawCapturePresent) {
    digestStatus = "pending"
  }

  return {
    rawCapturePresent,
    digestStatus,
    projectStateReady,
    digestErrorMessage:
      latestJob?.status === "failed" || latestJob?.status === "timed_out" ? latestJob.errorMessage ?? null : null,
    lastCapturedAt: latestSession?.capturedAt ?? null,
    lastDigestAt: latestDigest?.createdAt ?? latestJob?.completedAt ?? null
  }
}
