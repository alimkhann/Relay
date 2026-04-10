"use client"

import type { TelemetryEventInput } from "@relay/shared/types/telemetry"
import { buildPosthogEvent, buildPosthogExceptionProperties, shouldCapturePosthogException } from "@relay/shared/utils/posthog"
import posthog from "posthog-js"

let initialized = false

function resolveBrowserEnvironment() {
  if (typeof window === "undefined") {
    return process.env.NODE_ENV ?? "development"
  }

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return "development"
  }

  return process.env.NODE_ENV === "production" ? "production" : process.env.NODE_ENV ?? "development"
}

function toPosthogError(error: unknown, fallbackMessage: string) {
  if (error instanceof Error) {
    return error
  }

  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; name?: unknown; stack?: unknown }
    const nextError = new Error(typeof candidate.message === "string" ? candidate.message : fallbackMessage)

    if (typeof candidate.name === "string" && candidate.name.length > 0) {
      nextError.name = candidate.name
    }

    if (typeof candidate.stack === "string" && candidate.stack.length > 0) {
      nextError.stack = candidate.stack
    }

    return nextError
  }

  return new Error(typeof error === "string" ? error : fallbackMessage)
}

function getPosthogConfig() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim()

  if (!key) {
    return null
  }

  return {
    key,
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://eu.i.posthog.com",
  }
}

export function isPosthogEnabled() {
  return Boolean(getPosthogConfig())
}

export function ensurePosthog() {
  if (typeof window === "undefined" || initialized) {
    return isPosthogEnabled()
  }

  const config = getPosthogConfig()
  if (!config) {
    return false
  }

  posthog.init(config.key, {
    api_host: config.host,
    ui_host: "https://eu.posthog.com",
    capture_pageview: false,
    autocapture: false,
    disable_session_recording: true,
    persistence: "localStorage+cookie",
    person_profiles: "identified_only",
  })

  posthog.register({
    app_source: "relay-web",
    app: "web",
    environment: resolveBrowserEnvironment(),
  })

  initialized = true
  return true
}

export function capturePosthogTelemetry(input: TelemetryEventInput) {
  if (!ensurePosthog()) {
    return
  }

  const payload = buildPosthogEvent(input)
  posthog.capture(payload.event, payload.properties)
}

export function capturePosthogException(input: TelemetryEventInput) {
  if (!ensurePosthog() || !shouldCapturePosthogException(input)) {
    return
  }

  const error = toPosthogError(input.error, input.message)

  posthog.captureException(error, buildPosthogExceptionProperties(input))
}

export function identifyPosthogUser(userId: string) {
  if (!ensurePosthog()) {
    return
  }

  posthog.identify(userId)
}

export function resetPosthogUser() {
  if (!ensurePosthog()) {
    return
  }

  posthog.reset()
}

export { posthog }
