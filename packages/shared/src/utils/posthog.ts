import type { TelemetryEventInput } from "../types/telemetry"

const SAFE_CONTEXT_KEYS = new Set([
  "action",
  "authProvider",
  "command",
  "connected",
  "hasProject",
  "hasToken",
  "interval",
  "kind",
  "limitName",
  "method",
  "onboardingStatus",
  "period",
  "plan",
  "provider",
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

export function buildPosthogEvent(input: TelemetryEventInput) {
  return {
    event: normalizeEventName(input.event),
    properties: {
      surface: input.surface,
      area: input.area,
      level: input.level,
      flow_id: input.flowId ?? null,
      request_id: input.requestId ?? null,
      project_id: input.projectId ?? null,
      session_id: input.sessionId ?? null,
      tab_id: input.tabId ?? null,
      ...pickSafeContext(input.context),
    },
  }
}
