import type { TelemetryEventInput } from "../types/telemetry"

const SAFE_CONTEXT_KEYS = new Set([
  "actualModel",
  "action",
  "agentName",
  "associationConfidence",
  "associationMethod",
  "authIntent",
  "authMethod",
  "authProvider",
  "avgLatencyMs",
  "billingHealthStatus",
  "billingMode",
  "clientName",
  "command",
  "connected",
  "column",
  "costPerActivatedUserUsd",
  "costPerActiveUserUsd",
  "costPerAiRequestUsd",
  "costPerCaptureUsd",
  "costPerFreeActiveUserUsd",
  "costPerNewActivationUsd",
  "costPerPayingUserUsd",
  "costUsd",
  "currency",
  "chatProvider",
  "captureSignature",
  "digest",
  "deviceName",
  "durationMs",
  "enabled",
  "environment",
  "errorMessage",
  "errorSource",
  "errorType",
  "estimationMethod",
  "eventType",
  "failurePhase",
  "failureStage",
  "filename",
  "freeActiveUsers",
  "freeUserCostSharePct",
  "hasProject",
  "hasToken",
  "host",
  "interval",
  "issuesCount",
  "insertMode",
  "isFatal",
  "line",
  "kind",
  "latencyMs",
  "limitName",
  "model",
  "method",
  "neonBillingMode",
  "newAccounts",
  "newActivations",
  "onboardingStatus",
  "operation",
  "payingActiveUsers",
  "payingUserCostSharePct",
  "path",
  "paywallReason",
  "paywall_reason",
  "period",
  "persona",
  "plan",
  "platform",
  "provider",
  "projectCount",
  "projectName",
  "reason",
  "release",
  "retryAfterSeconds",
  "result",
  "savedVia",
  "section",
  "sessionId",
  "source",
  "sourceSurface",
  "sourceUrl",
  "snapshotDate",
  "status",
  "subcommand",
  "success",
  "syncSurface",
  "tabId",
  "tabCount",
  "targetProfileKey",
  "targetSurface",
  "teamId",
  "tokensIn",
  "tokensOut",
  "tokensTotal",
  "toolName",
  "topCostDriver",
  "turnCount",
  "type",
  "usageState",
  "userId",
  "utmCampaign",
  "utmMedium",
  "utmSource",
  "vercelBillingMode",
  "workspaceId",
])

const EVENT_NAME_ALIASES: Record<string, string> = {
  "google_sign_in.succeeded": "extension_auth_completed",
  "local_sign_in.succeeded": "extension_auth_completed",
  "google_sign_in.failed": "extension_auth_failed",
  "local_sign_in.failed": "extension_auth_failed",
  "project_create.started": "project_create_started",
  "project_create.succeeded": "project_created",
  "project_create.failed": "project_create_failed",
  "save_to_relay.succeeded": "selection_save_completed",
  "save_to_relay.failed": "selection_save_failed",
  "background.error": "error_occurred",
  "background.unhandled_rejection": "error_occurred",
  "sidebar.error": "error_occurred",
  "sidebar.unhandled_rejection": "error_occurred",
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

function getErrorMessage(error: unknown) {
  if (!error) return null
  if (typeof error === "string") return error.slice(0, 300)
  if (typeof error === "object") {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.length > 0) return message.slice(0, 300)
  }
  return null
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
      // Without these, error events were undiagnosable in PostHog (thousands
      // of inline_chip_error rows carrying no message at all).
      message: typeof input.message === "string" ? input.message.slice(0, 300) : null,
      error_message: getErrorMessage(input.error),
      ...pickSafeContext(input.context),
    },
  }
}
