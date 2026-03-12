"use client"

import { useEffect } from "react"

import type { TelemetrySurface } from "@relay/shared"

import { logClientEvent } from "@/lib/telemetry/client"

export function PageTelemetry({
  surface,
  area,
  event,
  message,
  context
}: {
  surface: TelemetrySurface
  area: string
  event: string
  message: string
  context?: Record<string, unknown>
}) {
  useEffect(() => {
    logClientEvent({
      level: "info",
      surface,
      area,
      event,
      message,
      context
    })
  }, [area, context, event, message, surface])

  return null
}
