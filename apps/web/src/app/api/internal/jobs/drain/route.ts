import { NextResponse } from "next/server"

import { runContinuityMaintenanceForUser } from "@/server/services/continuity-maintenance-service"
import { drainDigestJobs } from "@/server/services/digest-service"

const MAX_ROUTE_WORK_MS = 50_000
const MAX_DIGEST_JOBS_PER_INVOCATION = 1
const MAX_CONTINUITY_ITEMS_PER_INVOCATION = 1

export const maxDuration = 60

function normalizeSecret(value: string | null | undefined) {
  return value?.replace(/\\n/g, "").trim() ?? null
}

export async function POST(request: Request) {
  const startedAt = Date.now()
  const secret = normalizeSecret(process.env.RELAY_INTERNAL_API_SECRET)
  const provided = normalizeSecret(request.headers.get("x-relay-internal-secret"))

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    userId?: string
    limit?: number
    projectId?: string
    mode?: "digest" | "continuity" | "all"
  }
  if (!body.userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 })
  }

  const mode = body.mode ?? "all"
  const digestLimit = Math.min(
    MAX_DIGEST_JOBS_PER_INVOCATION,
    Math.max(1, Number(body.limit) || MAX_DIGEST_JOBS_PER_INVOCATION),
  )
  const continuityLimit = Math.min(
    MAX_CONTINUITY_ITEMS_PER_INVOCATION,
    Math.max(1, Number(body.limit) || MAX_CONTINUITY_ITEMS_PER_INVOCATION),
  )

  if (mode === "digest" || mode === "all") {
    await drainDigestJobs(body.userId, digestLimit)
  }

  let continuityResults: unknown[] = []
  if ((mode === "continuity" || mode === "all") && Date.now() - startedAt < MAX_ROUTE_WORK_MS) {
    continuityResults = await runContinuityMaintenanceForUser(body.userId, {
      projectId: body.projectId,
      limit: continuityLimit,
    })
  }

  return NextResponse.json({ ok: true, continuityResults })
}
