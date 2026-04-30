"use client"

import type { TelemetryEventInput } from "@relay/shared/types/telemetry"
import { buildPosthogExceptionProperties, shouldCapturePosthogException } from "@relay/shared/utils/posthog"
import posthog from "posthog-js"

import { buildRelayAnalyticsPayload } from "./analytics"

let initialized = false
const PREVIOUS_PATH_KEY = "relay.previous_path"

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
    disable_session_recording: false,
    session_recording: {
      maskTextSelector: ".mask-posthog",
      maskAllInputs: false,
    },
    capture_performance: { web_vitals: true },
    persistence: "localStorage+cookie",
    person_profiles: "identified_only",
  })

  posthog.register({
    app_source: "relay-web",
    app: "web",
    environment: resolveBrowserEnvironment(),
    is_authenticated: false,
  })

  initialized = true
  return true
}

export function capturePosthogTelemetry(input: TelemetryEventInput) {
  if (!ensurePosthog()) {
    return
  }

  const url = new URL(window.location.href)
  const previousPath =
    typeof window === "undefined" ? null : window.sessionStorage.getItem(PREVIOUS_PATH_KEY)
  const payload = buildRelayAnalyticsPayload(input, {
    mode: "client",
    pathname: url.pathname,
    referrer: document.referrer || null,
    fromPath: previousPath,
    utmSource: url.searchParams.get("utm_source"),
    utmMedium: url.searchParams.get("utm_medium"),
    utmCampaign: url.searchParams.get("utm_campaign"),
    userId:
      ((posthog as unknown as { get_property?: (key: string) => unknown }).get_property?.("user_id") as string | null | undefined) ??
      null,
    sessionId:
      ((posthog as unknown as { get_session_id?: () => string | null }).get_session_id?.() as string | null | undefined) ??
      null,
    plan:
      ((posthog as unknown as { get_property?: (key: string) => unknown }).get_property?.("plan") as string | null | undefined) ??
      null,
    isAuthenticated:
      ((posthog as unknown as { get_property?: (key: string) => unknown }).get_property?.("is_authenticated") as boolean | null | undefined) ??
      null,
  })
  posthog.capture(payload.event, payload.properties)

  if (payload.event === "$pageview") {
    window.sessionStorage.setItem(PREVIOUS_PATH_KEY, url.pathname)
  }
}

export function capturePosthogException(input: TelemetryEventInput) {
  if (!ensurePosthog() || !shouldCapturePosthogException(input)) {
    return
  }

  const error = toPosthogError(input.error, input.message)

  posthog.captureException(error, buildPosthogExceptionProperties(input))
}

export function identifyPosthogUser(
  userId: string,
  properties: {
    name?: string | null
    email?: string | null
    plan?: string | null
    created_at?: string | null
    signup_source?: string | null
    is_extension_installed?: boolean | null
    is_employee?: boolean | null
    is_test_user?: boolean | null
  } = {}
) {
  if (!ensurePosthog()) {
    return
  }

  posthog.identify(userId, properties)
  posthog.register({
    user_id: userId,
    plan: properties.plan ?? null,
    is_authenticated: true,
    is_extension_installed: properties.is_extension_installed ?? null,
    signup_source: properties.signup_source ?? null,
    is_employee: properties.is_employee ?? null,
    is_test_user: properties.is_test_user ?? null,
  })
}

export function resetPosthogUser() {
  if (!ensurePosthog()) {
    return
  }

  posthog.reset()
  posthog.register({
    user_id: null,
    plan: null,
    is_authenticated: false,
    is_extension_installed: null,
    signup_source: null,
    is_employee: null,
    is_test_user: null,
  })
}

export { posthog }
