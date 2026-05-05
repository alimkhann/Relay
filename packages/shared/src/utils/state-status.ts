import type { AiJobRunRow, SourceSessionRow } from "../types/database"
import type { ProjectStateDto, ProjectStateStatusDto, SessionDigestDto } from "../types/project"

interface DeriveProjectStateStatusInput {
  sessions: Array<Pick<SourceSessionRow, "capturedAt">>
  digests: Array<Pick<SessionDigestDto, "createdAt">>
  projectState: Pick<ProjectStateDto, "updatedAt"> | null
  digestJobs: Array<Pick<AiJobRunRow, "id" | "status" | "errorMessage" | "createdAt" | "completedAt" | "attempts" | "fallbackUsed" | "outputPayload">>
}

const STALE_JOB_MS = 10 * 60 * 1000

function isStaleJob(job: Pick<AiJobRunRow, "status" | "createdAt">): boolean {
  if (job.status !== "pending") return false
  const age = Date.now() - new Date(job.createdAt).getTime()
  return age > STALE_JOB_MS
}

export function deriveProjectStateStatus(input: DeriveProjectStateStatusInput): ProjectStateStatusDto {
  const latestSession = input.sessions[0] ?? null
  const latestDigest = input.digests[0] ?? null
  const latestJob = input.digestJobs[0] ?? null
  const rawCapturePresent = input.sessions.length > 0
  const projectStateReady = Boolean(input.projectState)

  const jobIsStale = latestJob ? isStaleJob(latestJob) : false

  let digestStatus: ProjectStateStatusDto["digestStatus"] = "idle"
  if (latestJob) {
    digestStatus = jobIsStale ? "timed_out" : latestJob.status
  } else if (projectStateReady || latestDigest) {
    digestStatus = "completed"
  } else if (rawCapturePresent) {
    digestStatus = "pending"
  }

  const outputPayload = latestJob?.outputPayload ?? {}
  const activeJobStage =
    typeof outputPayload.jobStage === "string"
      ? outputPayload.jobStage
      : typeof outputPayload.stage === "string"
        ? outputPayload.stage
        : null
  const fallbackPlanned = Boolean(outputPayload.fallbackPlanned)

  return {
    rawCapturePresent,
    digestStatus,
    projectStateReady,
    digestErrorMessage:
      latestJob?.status === "failed" || latestJob?.status === "timed_out" ? latestJob.errorMessage ?? null : null,
    lastCapturedAt: latestSession?.capturedAt ?? null,
    lastDigestAt: latestDigest?.createdAt ?? latestJob?.completedAt ?? null,
    activeJobId: latestJob?.id ?? null,
    activeJobStatus: latestJob ? (jobIsStale ? "timed_out" : latestJob.status) : (projectStateReady || latestDigest ? "completed" : "idle"),
    activeJobStage,
    activeJobAttempts: latestJob?.attempts ?? 0,
    fallbackPlanned,
    fallbackUsed: latestJob?.fallbackUsed ?? false
  }
}
