"use client"

import type { TelemetryEventInput, TelemetrySurface } from "@relay/shared"
import { createFlowId, sanitizeTelemetryEvent } from "@relay/shared"

const queue: TelemetryEventInput[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushInFlight = false

function resolveWebSurface(pathname: string): TelemetrySurface {
  if (pathname === "/") return "web-landing"
  if (pathname.startsWith("/sign-in")) return "web-auth"
  return "web-dashboard"
}

function scheduleFlush() {
  if (flushTimer) return

  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushTelemetryQueue()
  }, 1200)
}

export function flushTelemetryQueue() {
  if (flushInFlight || queue.length === 0 || typeof window === "undefined") {
    return Promise.resolve()
  }

  flushInFlight = true
  const payload = queue.splice(0, 25)

  return fetch("/api/telemetry/logs", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ logs: payload }),
    keepalive: true
  })
    .catch((error) => {
      console.error("[Relay Web] telemetry flush failed", error)
      queue.unshift(...payload)
    })
    .finally(() => {
      flushInFlight = false
      if (queue.length > 0) {
        scheduleFlush()
      }
    })
}

export function logClientEvent(
  input: Omit<TelemetryEventInput, "surface"> & { surface?: TelemetrySurface }
) {
  if (typeof window === "undefined") return

  queue.push(
    sanitizeTelemetryEvent({
      ...input,
      surface: input.surface ?? resolveWebSurface(window.location.pathname),
      url: input.url ?? window.location.pathname
    })
  )

  if (queue.length >= 10) {
    void flushTelemetryQueue()
    return
  }

  scheduleFlush()
}

export function createClientFlowId(prefix = "web") {
  return createFlowId(prefix)
}
