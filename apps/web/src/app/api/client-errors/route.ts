import { NextResponse } from "next/server"
import type { TelemetryEventInput, TelemetryLevel, TelemetrySurface } from "@relay/shared"

import { withApiRoute } from "@/server/http/api-route"
import { logServerEvent } from "@/server/logging/logger"

const validLevels = new Set<TelemetryLevel>(["debug", "info", "warn", "error"])
const validSurfaces = new Set<TelemetrySurface>([
  "web-landing",
  "web-dashboard",
  "web-auth",
  "web-api",
  "extension-background",
  "extension-sidebar",
  "extension-inline-chip"
])

export const POST = withApiRoute(async (request: Request) => {
  const payload = (await request.json().catch(() => null)) as Partial<TelemetryEventInput> | null

  await logServerEvent({
    level:
      payload?.level && validLevels.has(payload.level)
        ? payload.level
        : "error",
    surface:
      payload?.surface && validSurfaces.has(payload.surface)
        ? payload.surface
        : "web-dashboard",
    area:
      typeof payload?.area === "string" && payload.area.length > 0
        ? payload.area
        : "client",
    event:
      typeof payload?.event === "string" && payload.event.length > 0
        ? payload.event
        : "client.error_reported",
    message:
      typeof payload?.message === "string" && payload.message.length > 0
        ? payload.message
        : "Client-side error reported.",
    url: typeof payload?.url === "string" ? payload.url : null,
    flowId: typeof payload?.flowId === "string" ? payload.flowId : null,
    context: payload?.context ?? {},
    error: payload?.error ?? null
  })

  return NextResponse.json({ ok: true }, { status: 202 })
}, { logSuccess: false })
