"use client"

import { createClientFlowId, logClientEvent } from "@/lib/telemetry/client"

export function trackMarketingEvent(event: string, context?: Record<string, unknown>) {
  logClientEvent({
    level: "info",
    surface: "web-landing",
    area: "marketing",
    event,
    flowId: createClientFlowId("landing"),
    message: `Captured marketing event: ${event}`,
    context,
  })
}
