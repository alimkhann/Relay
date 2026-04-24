"use client"

import type { TelemetryEventInput, TelemetrySurface } from "@relay/shared/types/telemetry"
import { shouldCapturePosthogException } from "@relay/shared/utils/posthog"
import { sanitizeTelemetryEvent } from "@relay/shared/utils/telemetry"

import { capturePosthogException } from "./posthog"

const REPORT_WINDOW_MS = 60_000
const recentReports = new Map<string, number>()

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

  const reportKey = [
    event.event,
    event.message,
    event.url,
    typeof event.error === "object" && event.error && "message" in event.error
      ? String((event.error as { message?: unknown }).message)
      : String(event.error ?? ""),
  ].join("|")
  const now = Date.now()
  const lastReportedAt = recentReports.get(reportKey) ?? 0
  if (now - lastReportedAt < REPORT_WINDOW_MS) {
    return
  }
  recentReports.set(reportKey, now)

  void fetch("/api/client-errors", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(event),
    keepalive: true
  }).catch(() => {})
}
