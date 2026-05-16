import { timingSafeEqual } from "node:crypto"

import { NextResponse } from "next/server"

import { createRepositoryBundle } from "@relay/db"

import { runContinuityMaintenanceForUser } from "@/server/services/continuity-maintenance-service"
import { emitDailyCostSnapshots } from "@/server/services/cost-snapshot-service"
import { drainDigestJobs } from "@/server/services/digest-service"
import { sweepStaleProcessingSources } from "@/server/services/source-service"

const MAX_USERS_PER_INVOCATION = 1
const MAX_DIGEST_JOBS_PER_USER = 1
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

  // Query without RLS to find all users with pending/timed_out jobs
  const repositories = createRepositoryBundle()
  const rows = await repositories.provider.query(
    `select distinct created_by
     from ai_job_runs
     where status in ('pending', 'timed_out', 'deferred')
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

  return NextResponse.json({ processed: results.length, results, costSnapshots, staleSources })
}
