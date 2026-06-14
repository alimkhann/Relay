import { timingSafeEqual } from "node:crypto"

import { NextResponse } from "next/server"

import { createWorkerRepositoryBundle } from "@relay/db"

import { runContinuityMaintenanceForUser } from "@/server/services/continuity-maintenance-service"
import { emitDailyCostSnapshots } from "@/server/services/cost-snapshot-service"
import { drainDigestJobs } from "@/server/services/digest-service"
import { drainDueProjectHygiene, drainMemoryPipelineJobs } from "@/server/services/memory-pipeline-scheduler"
import { drainLifecycleEmails } from "@/server/services/lifecycle-email-service"
import { sweepStaleProcessingSources } from "@/server/services/source-service"

// The cron is invoked frequently (external scheduler tick, see
// .github/workflows/drain.yml) so each run drains a batch of users until the
// time budget is hit rather than a single user/job. This is what keeps session
// digests from backlogging — captures must become searchable memory within
// minutes, not days.
const MAX_USERS_PER_INVOCATION = 8
const MAX_DIGEST_JOBS_PER_USER = 4
const MAX_WORK_MS = 45_000

export const maxDuration = 60

export async function GET(request: Request) {
  const startedAt = Date.now()
  const cronSecret = process.env["CRON_SECRET"]
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 500 })
  }

  const authHeader = request.headers.get("authorization") ?? ""
  const expected = `Bearer ${cronSecret}`
  const a = Buffer.from(authHeader)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  // Cross-tenant scan to find all users with pending jobs — runs under the
  // worker role (bypassrls).
  const repositories = createWorkerRepositoryBundle()
  // Oldest backlog first so stuck users get unblocked fairly across ticks.
  const rows = await repositories.provider.query(
    `select created_by
     from ai_job_runs
     where status in ('pending', 'timed_out', 'deferred')
     group by created_by
     order by min(created_at) asc
     limit $1`,
    [MAX_USERS_PER_INVOCATION]
  )

  const userIds = rows.map((row) => (row as Record<string, unknown>)["created_by"] as string)

  const results: Array<{ userId: string; ok: boolean; error?: string }> = []

  for (const userId of userIds) {
    try {
      if (Date.now() - startedAt >= MAX_WORK_MS) {
        results.push({ userId, ok: false, error: "Cron work budget exhausted before this user." })
        continue
      }

      await drainDigestJobs(userId, MAX_DIGEST_JOBS_PER_USER)

      if (Date.now() - startedAt < MAX_WORK_MS) {
        await runContinuityMaintenanceForUser(userId)
      }
      results.push({ userId, ok: true })
    } catch (error) {
      results.push({
        userId,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }

  const costSnapshots = await emitDailyCostSnapshots().catch((error) => ({
    error: error instanceof Error ? error.message : "Unknown error",
  }))

  // Recover sources orphaned in `processing` (out-of-band ingest died). Bounded
  // and only if there's work budget left this invocation.
  const staleSources = Date.now() - startedAt < MAX_WORK_MS
    ? await sweepStaleProcessingSources({ limit: 5 }).catch((error) => ({
        error: error instanceof Error ? error.message : "Unknown error",
      }))
    : { skipped: "work budget exhausted" }

  const memoryPipeline = Date.now() - startedAt < MAX_WORK_MS
    ? await drainMemoryPipelineJobs({ limit: 10, maxMs: 10_000 }).catch((error) => ({
        error: error instanceof Error ? error.message : "Unknown error",
      }))
    : { skipped: "work budget exhausted" }

  const memoryHygiene = Date.now() - startedAt < MAX_WORK_MS
    ? await drainDueProjectHygiene({ limit: 5, maxMs: 10_000 }).catch((error) => ({
        error: error instanceof Error ? error.message : "Unknown error",
      }))
    : { skipped: "work budget exhausted" }

  // Lifecycle/reactivation emails (dark unless RELAY_LIFECYCLE_EMAILS=true).
  // Runs on the cron's existing compute — no extra DB wake-ups.
  const lifecycleEmails = Date.now() - startedAt < MAX_WORK_MS
    ? await drainLifecycleEmails({ maxMs: 10_000 }).catch((error) => ({
        error: error instanceof Error ? error.message : "Unknown error",
      }))
    : { skipped: "work budget exhausted" }

  return NextResponse.json({ processed: results.length, results, costSnapshots, staleSources, memoryPipeline, memoryHygiene, lifecycleEmails })
}
