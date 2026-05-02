import { NextResponse } from "next/server"
import type { TelemetryEventInput } from "@relay/shared"
import { telemetryEventSchema } from "@relay/shared"

import { withApiRoute } from "@/server/http/api-route"
import { logServerEvent } from "@/server/logging/logger"

export const POST = withApiRoute(async (request: Request) => {
  const payload = (await request.json().catch(() => null)) as Partial<TelemetryEventInput> | null
  const parsed = telemetryEventSchema.safeParse(payload)

  const event = parsed.success
    ? {
        ...parsed.data,
        context: {
          ...parsed.data.context,
          reportedVia: "client-report",
        },
      }
    : ({
        level: "error",
        surface: "web-dashboard",
        area: "client",
        event: "client.error_reported",
        message: "Client-side error reported.",
        url: typeof payload?.url === "string" ? payload.url : null,
        flowId: typeof payload?.flowId === "string" ? payload.flowId : null,
        context: {
          ...(payload?.context ?? {}),
          reportedVia: "client-report",
        },
        error: payload?.error ?? null,
      } satisfies TelemetryEventInput)

  await logServerEvent(event)

  return NextResponse.json({ ok: true }, { status: 202 })
}, { logSuccess: false })
