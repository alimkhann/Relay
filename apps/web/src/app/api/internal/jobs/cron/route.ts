import { NextResponse } from "next/server"

import { createRepositoryBundle } from "@relay/db"

import { runContinuityMaintenanceForUser } from "@/server/services/continuity-maintenance-service"
import { drainDigestJobs } from "@/server/services/digest-service"

const MAX_USERS_PER_INVOCATION = 10

export async function GET(request: Request) {
  const cronSecret = process.env["CRON_SECRET"]
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 500 })
  }

  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  // Query without RLS to find all users with pending/timed_out jobs
  const repositories = createRepositoryBundle()
  const rows = await repositories.provider.query(
    `select distinct created_by
     from ai_job_runs
     where status in ('pending', 'timed_out')
     limit $1`,
    [MAX_USERS_PER_INVOCATION]
  )

  const userIds = rows.map((row) => (row as Record<string, unknown>)["created_by"] as string)

  const results: Array<{ userId: string; ok: boolean; error?: string }> = []

  for (const userId of userIds) {
    try {
      await drainDigestJobs(userId, 4)
      await runContinuityMaintenanceForUser(userId)
      results.push({ userId, ok: true })
    } catch (error) {
      results.push({
        userId,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}
