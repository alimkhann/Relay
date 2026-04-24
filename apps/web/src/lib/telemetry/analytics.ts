import type { TelemetryEventInput } from "@relay/shared/types/telemetry"
import { sanitizeTelemetryEvent } from "@relay/shared/utils/telemetry"

type PosthogScalar = string | number | boolean | null

export interface RelayAnalyticsRuntime {
  mode: "client" | "server"
  pathname?: string | null
  referrer?: string | null
  fromPath?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  userId?: string | null
  sessionId?: string | null
  plan?: string | null
  isAuthenticated?: boolean | null
}

export interface RelayAnalyticsPayload {
  event: string
  distinctId: string
  properties: Record<string, PosthogScalar>
}

const EVENT_NAME_ALIASES: Record<string, string> = {
  landing_page_viewed: "page_viewed",
  auth_page_viewed: "page_viewed",
  dashboard_viewed: "page_viewed",
  brief_viewed: "page_viewed",
  memory_viewed: "page_viewed",
  activity_viewed: "page_viewed",
  settings_viewed: "page_viewed",
  "google_sign_in.started": "sign_in_started",
  "local_sign_in.started": "sign_in_started",
  "google_sign_in.failed": "sign_in_failed",
  "local_sign_in.failed": "sign_in_failed",
  "local_auth.succeeded": "sign_in_completed",
  "local_auth.failed": "sign_in_failed",
  "dashboard.onboarding_pending": "onboarding_viewed",
  "project_create.submit": "project_create_started",
  "project_create.succeeded": "project_created",
  "project_create.failed": "project_create_failed",
  "project.create.succeeded": "project_created",
  "project.create.failed": "project_create_failed",
  "extension_connect.start": "extension_connect_started",
  "extension_connect.completed": "extension_connect_completed",
  "extension_connect.runtime_missing": "extension_connect_failed",
  "extension_connect.runtime_failed": "extension_connect_failed",
  "extension_connect.bridge_failed": "extension_connect_failed",
  digest_job_finished: "digest_completed",
  "billing.checkout_created": "billing_checkout_started",
  billing_checkout_succeeded: "billing_checkout_completed",
  "billing.portal_created": "billing_portal_opened",
  billing_resync_invoked: "billing_resync_requested",
  "billing.manual_resync": "billing_resync_requested",
  "billing.plan_transition": "subscription_state_changed",
  "billing.subscription_state_synced": "subscription_state_changed",
  usage_limit_block_shown: "usage_limit_shown",
  usage_limit_warning_shown: "usage_limit_shown",
  "app.error_boundary_triggered": "error_occurred",
  "window.error": "error_occurred",
  "window.unhandled_rejection": "error_occurred",
  "api.exception": "error_occurred",
  "client.error_reported": "error_occurred",
}

const PAGE_NAMES_BY_EVENT: Record<string, string> = {
  landing_page_viewed: "landing",
  auth_page_viewed: "sign_in",
  dashboard_viewed: "dashboard",
  brief_viewed: "brief",
  memory_viewed: "memory",
  activity_viewed: "activity",
  settings_viewed: "settings",
}

function toSnakeCase(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
}

function normalizeEventName(event: string) {
  return EVENT_NAME_ALIASES[event] ?? toSnakeCase(event)
}

function normalizePropertyValue(value: unknown): PosthogScalar {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value
  }

  return null
}

function pickScalarContext(context: Record<string, unknown> | undefined) {
  const properties: Record<string, PosthogScalar> = {}

  for (const [key, value] of Object.entries(context ?? {})) {
    const normalized = normalizePropertyValue(value)

    if (normalized === null && value !== null) {
      continue
    }

    properties[toSnakeCase(key)] = normalized
  }

  return properties
}

function getContextString(
  context: Record<string, PosthogScalar>,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = context[toSnakeCase(key)]

    if (typeof value === "string" && value.length > 0) {
      return value
    }
  }

  return null
}

function getContextBoolean(
  context: Record<string, PosthogScalar>,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = context[toSnakeCase(key)]

    if (typeof value === "boolean") {
      return value
    }
  }

  return null
}

function resolvePathname(value: string | null | undefined) {
  if (!value) {
    return null
  }

  try {
    if (value.startsWith("/")) {
      return new URL(`https://relay.local${value}`).pathname
    }

    return new URL(value).pathname
  } catch {
    return value.startsWith("/") ? value : null
  }
}

function resolvePageGroup(pathname: string | null) {
  if (!pathname) return "unknown"
  if (pathname === "/") return "landing"
  if (pathname.startsWith("/sign-in")) return "auth"
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/brief") ||
    pathname.startsWith("/memory") ||
    pathname.startsWith("/activity") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/projects")
  ) {
    return "workspace"
  }
  if (pathname.startsWith("/docs")) return "docs"
  if (pathname.startsWith("/get-started")) return "onboarding"

  return pathname.split("/").filter(Boolean)[0] ?? "unknown"
}

function resolvePageName(
  rawEvent: string,
  pathname: string | null,
  context: Record<string, PosthogScalar>
) {
  const explicit = getContextString(context, "page_name", "pageName")
  if (explicit) {
    return explicit
  }

  const mapped = PAGE_NAMES_BY_EVENT[rawEvent]
  if (mapped) {
    return mapped
  }

  if (!pathname || pathname === "/") {
    return "landing"
  }

  const segments = pathname.split("/").filter(Boolean)
  return segments.at(-1) ?? "unknown"
}

function getErrorType(input: TelemetryEventInput) {
  if (input.error instanceof Error && input.error.name) {
    return input.error.name
  }

  if (input.error && typeof input.error === "object") {
    const name = (input.error as { name?: unknown }).name
    if (typeof name === "string" && name.length > 0) {
      return name
    }
  }

  return normalizeEventName(input.event)
}

function getErrorMessage(input: TelemetryEventInput) {
  if (input.error instanceof Error && input.error.message) {
    return input.error.message
  }

  if (input.error && typeof input.error === "object") {
    const message = (input.error as { message?: unknown }).message
    if (typeof message === "string" && message.length > 0) {
      return message
    }
  }

  return input.message
}

export function buildRelayAnalyticsPayload(
  input: TelemetryEventInput,
  runtime: RelayAnalyticsRuntime
): RelayAnalyticsPayload {
  const event = sanitizeTelemetryEvent(input)
  const contextScalars = pickScalarContext(event.context)
  const pathname = resolvePathname(runtime.pathname ?? event.url)
  const pageName = resolvePageName(event.event, pathname, contextScalars)
  const pageGroup = getContextString(contextScalars, "page_group", "pageGroup") ?? resolvePageGroup(pathname)
  const projectId = event.projectId ?? getContextString(contextScalars, "project_id", "projectId")
  const userId = event.userId ?? runtime.userId ?? getContextString(contextScalars, "user_id", "userId")
  const sessionId = event.sessionId ?? runtime.sessionId ?? getContextString(contextScalars, "session_id", "sessionId")
  const plan = runtime.plan ?? getContextString(contextScalars, "plan")
  const isAuthenticated =
    runtime.isAuthenticated ??
    getContextBoolean(contextScalars, "is_authenticated", "isAuthenticated") ??
    Boolean(userId)
  const canonicalEvent = normalizeEventName(event.event)
  const sourceEvent = toSnakeCase(event.event)

  const properties: Record<string, PosthogScalar> = {
    ...contextScalars,
    user_id: userId ?? null,
    session_id: sessionId ?? null,
    timestamp: event.timestamp ?? null,
    platform: "web",
    pathname,
    page_name: pageName,
    page_group: pageGroup,
    from_path: runtime.fromPath ?? getContextString(contextScalars, "from_path", "fromPath"),
    referrer: runtime.referrer ?? getContextString(contextScalars, "referrer"),
    utm_source: runtime.utmSource ?? getContextString(contextScalars, "utm_source", "utmSource"),
    utm_medium: runtime.utmMedium ?? getContextString(contextScalars, "utm_medium", "utmMedium"),
    utm_campaign: runtime.utmCampaign ?? getContextString(contextScalars, "utm_campaign", "utmCampaign"),
    plan: plan ?? null,
    is_authenticated: isAuthenticated,
    project_id: projectId ?? null,
    flow_id: event.flowId ?? null,
    request_id: event.requestId ?? null,
    surface: event.surface,
    area: event.area,
    level: event.level,
    raw_event_name: sourceEvent === canonicalEvent ? null : sourceEvent,
  }

  if (canonicalEvent === "error_occurred") {
    properties.error_type = getContextString(contextScalars, "error_type", "errorType") ?? getErrorType(event)
    properties.error_message =
      getContextString(contextScalars, "error_message", "errorMessage") ?? getErrorMessage(event)
    properties.error_source = sourceEvent
    properties.failure_stage = getContextString(contextScalars, "failure_stage", "failureStage")
    properties.is_fatal = getContextBoolean(contextScalars, "is_fatal", "isFatal") ?? true
  }

  return {
    event: canonicalEvent,
    distinctId: userId ?? `anon-${crypto.randomUUID()}`,
    properties,
  }
}
