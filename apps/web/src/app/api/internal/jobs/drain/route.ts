import { NextResponse } from "next/server"

import { runContinuityMaintenanceForUser } from "@/server/services/continuity-maintenance-service"
import { drainDigestJobs } from "@/server/services/digest-service"

function normalizeSecret(value: string | null | undefined) {
  return value?.replace(/\\n/g, "").trim() ?? null
}

export async function POST(request: Request) {
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

  if (mode === "digest" || mode === "all") {
    await drainDigestJobs(body.userId, body.limit ?? 4)
  }

  let continuityResults: unknown[] = []
  if (mode === "continuity" || mode === "all") {
    continuityResults = await runContinuityMaintenanceForUser(body.userId, {
      projectId: body.projectId,
      limit: body.limit ?? 4,
    })
  }

  return NextResponse.json({ ok: true, continuityResults })
}
