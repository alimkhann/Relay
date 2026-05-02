"use client"

import type { TelemetryEventInput, TelemetrySurface } from "@relay/shared/types/telemetry"
import { createFlowId, sanitizeTelemetryEvent } from "@relay/shared/utils/telemetry"

import { capturePosthogTelemetry } from "./posthog"

function resolveWebSurface(pathname: string): TelemetrySurface {
  if (pathname === "/") return "web-landing"
  if (pathname.startsWith("/sign-in")) return "web-auth"
  if (pathname.startsWith("/settings")) return "web-settings"
  return "web-dashboard"
}

export function flushTelemetryQueue() {
  return Promise.resolve()
}

function writeConsoleEvent(event: TelemetryEventInput) {
  const prefix = `[Relay Web] ${event.surface} ${event.event}`

  if (event.level === "error") {
    console.error(prefix, event)
    return
  }

  if (event.level === "warn") {
    console.warn(prefix, event)
    return
  }

  if (event.level === "debug") {
    console.debug(prefix, event)
    return
  }

  console.info(prefix, event)
}

export function logClientEvent(
  input: Omit<TelemetryEventInput, "surface"> & { surface?: TelemetrySurface }
) {
  if (typeof window === "undefined") return

  const event = sanitizeTelemetryEvent({
    ...input,
    surface: input.surface ?? resolveWebSurface(window.location.pathname),
    url: input.url ?? window.location.pathname
  })

  writeConsoleEvent(event)
  capturePosthogTelemetry(event)
}

export function createClientFlowId(prefix = "web") {
  return createFlowId(prefix)
}
