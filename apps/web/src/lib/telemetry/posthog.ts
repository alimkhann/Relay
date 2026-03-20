"use client"

import type { TelemetryEventInput } from "@relay/shared/types/telemetry"
import { buildPosthogEvent } from "@relay/shared/utils/posthog"
import posthog from "posthog-js"

let initialized = false

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
    capture_pageview: false,
    autocapture: false,
    disable_session_recording: true,
    persistence: "localStorage+cookie",
    person_profiles: "identified_only",
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
