import { NextResponse } from "next/server"

import type { TelemetrySurface } from "@relay/shared"

import { withApiRoute } from "@/server/http/api-route"
import { requireDebugViewer } from "@/server/logging/debug-access"
import { listTelemetryLogs } from "@/server/logging/logger"

export const GET = withApiRoute(async (request: Request) => {
  try {
    await requireDebugViewer()
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Debug access denied." },
      { status: 403 }
    )
  }

  const url = new URL(request.url)
  const logs = await listTelemetryLogs({
    level: (url.searchParams.get("level") as "debug" | "info" | "warn" | "error" | null) ?? undefined,
    surface: (url.searchParams.get("surface") as TelemetrySurface | null) ?? undefined,
    requestId: url.searchParams.get("requestId") ?? undefined,
    flowId: url.searchParams.get("flowId") ?? undefined,
    userId: url.searchParams.get("userId") ?? undefined,
    projectId: url.searchParams.get("projectId") ?? undefined,
    since: url.searchParams.get("since") ?? undefined,
    until: url.searchParams.get("until") ?? undefined,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined
  })

  return NextResponse.json({ logs })
}, { logSuccess: false })
