import type { TelemetryEventInput } from "../types/telemetry"

const SAFE_CONTEXT_KEYS = new Set([
  "action",
  "agentName",
  "associationConfidence",
  "associationMethod",
  "authProvider",
  "clientName",
  "command",
  "connected",
  "column",
  "digest",
  "durationMs",
  "eventType",
  "filename",
  "hasProject",
  "hasToken",
  "interval",
  "issuesCount",
  "line",
  "kind",
  "limitName",
  "method",
  "onboardingStatus",
  "path",
  "period",
  "plan",
  "provider",
  "reason",
  "retryAfterSeconds",
  "result",
  "savedVia",
  "section",
  "source",
  "status",
  "subcommand",
  "success",
  "syncSurface",
  "tabCount",
  "targetProfileKey",
  "toolName",
  "type",
  "usageState",
  "workspaceId",
])

const EVENT_NAME_ALIASES: Record<string, string> = {
  "google_sign_in.succeeded": "extension_authenticated",
  "local_sign_in.succeeded": "extension_authenticated",
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

function normalizePropertyValue(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value
  }

  return null
}

function pickSafeContext(context: Record<string, unknown> | undefined) {
  if (!context) return {}

  const properties: Record<string, string | number | boolean | null> = {}

  for (const [key, value] of Object.entries(context)) {
    if (!SAFE_CONTEXT_KEYS.has(key)) continue
    properties[toSnakeCase(key)] = normalizePropertyValue(value)
  }

  return properties
}

function getStringContextValue(context: Record<string, unknown> | undefined, key: string) {
  const value = context?.[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

function getErrorName(error: unknown) {
  if (!error || typeof error !== "object") {
    return null
  }

  const name = (error as { name?: unknown }).name
  return typeof name === "string" && name.length > 0 ? name : null
}

const EXCEPTION_EVENT_PATTERN = /(^|\.)(error|exception|unhandled_rejection)$/

export function shouldCapturePosthogException(input: TelemetryEventInput) {
  if (input.level !== "error") {
    return false
  }

  if (!input.error && input.event !== "app.error_boundary_triggered") {
    return false
  }

  return (
    input.area === "runtime" ||
    input.event === "app.error_boundary_triggered" ||
    EXCEPTION_EVENT_PATTERN.test(input.event)
  )
}

export function buildPosthogExceptionProperties(input: TelemetryEventInput) {
  const payload = buildPosthogEvent(input)
  const errorName = getErrorName(input.error)

  return {
    ...payload.properties,
    event_name: payload.event,
    error_name: errorName,
  }
}

export function buildPosthogEvent(input: TelemetryEventInput) {
  const projectId = input.projectId ?? getStringContextValue(input.context, "projectId")

  return {
    event: normalizeEventName(input.event),
    properties: {
      surface: input.surface,
      area: input.area,
      level: input.level,
      flow_id: input.flowId ?? null,
      request_id: input.requestId ?? null,
      project_id: projectId ?? null,
      session_id: input.sessionId ?? null,
      tab_id: input.tabId ?? null,
      ...pickSafeContext(input.context),
    },
  }
}
