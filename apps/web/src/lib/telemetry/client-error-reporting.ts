"use client"

import type { TelemetryEventInput, TelemetrySurface } from "@relay/shared/types/telemetry"
import { sanitizeTelemetryEvent } from "@relay/shared/utils/telemetry"

function resolveClientErrorSurface(pathname: string): TelemetrySurface {
  if (pathname === "/") return "web-landing"
  if (pathname.startsWith("/sign-in")) return "web-auth"
  return "web-dashboard"
}

export function reportClientError(
  input: Omit<TelemetryEventInput, "surface" | "level"> & {
    level?: TelemetryEventInput["level"]
    surface?: TelemetrySurface
  }
) {
  if (typeof window === "undefined") {
    return
  }

  const event = sanitizeTelemetryEvent({
    ...input,
    level: input.level ?? "error",
    surface: input.surface ?? resolveClientErrorSurface(window.location.pathname),
    url: input.url ?? window.location.pathname
  })

  void fetch("/api/client-errors", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(event),
    keepalive: true
  }).catch(() => {})
}
