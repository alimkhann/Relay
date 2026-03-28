"use client"

import type { TelemetryEventInput, TelemetrySurface } from "@relay/shared/types/telemetry"
import { shouldCapturePosthogException } from "@relay/shared/utils/posthog"
import { sanitizeTelemetryEvent } from "@relay/shared/utils/telemetry"

import { capturePosthogException } from "./posthog"

function resolveClientErrorSurface(pathname: string): TelemetrySurface {
  if (pathname === "/") return "web-landing"
  if (pathname.startsWith("/sign-in")) return "web-auth"
  if (pathname.startsWith("/settings")) return "web-settings"
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

  if (shouldCapturePosthogException(event)) {
    capturePosthogException(event)
  }

  void fetch("/api/client-errors", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(event),
    keepalive: true
  }).catch(() => {})
}
