import { NextResponse } from "next/server"

import { telemetryBatchSchema } from "@relay/shared"

import { withApiRoute } from "@/server/http/api-route"
import { ingestTelemetryLogs } from "@/server/logging/logger"
import { resolveOptionalViewer } from "@/server/policies/viewer"

export const POST = withApiRoute(async (request: Request) => {
  const payload = telemetryBatchSchema.parse(await request.json())
  const viewer = await resolveOptionalViewer(request.headers.get("authorization"))

  await ingestTelemetryLogs(
    payload.logs.map((log) => ({
      ...log,
      userId: log.userId ?? viewer?.userId ?? null
    }))
  )

  return NextResponse.json({
    ok: true,
    ingested: payload.logs.length
  })
}, { logSuccess: false })
