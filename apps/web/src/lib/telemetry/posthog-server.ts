import type { TelemetryEventInput } from "@relay/shared/types/telemetry"
import { buildPosthogEvent } from "@relay/shared/utils/posthog"
import { sanitizeError, sanitizeTelemetryEvent } from "@relay/shared/utils/telemetry"

const POSTHOG_KEY = process.env["RELAY_POSTHOG_KEY"] ?? process.env["NEXT_PUBLIC_POSTHOG_KEY"]
const POSTHOG_HOST = process.env["RELAY_POSTHOG_HOST"] ?? process.env["NEXT_PUBLIC_POSTHOG_HOST"] ?? "https://eu.i.posthog.com"

type PosthogScalar = string | number | boolean | null

function getServerEnvironment() {
  return process.env["VERCEL_ENV"] ?? process.env.NODE_ENV ?? "development"
}

function getServerRelease() {
  return process.env["VERCEL_GIT_COMMIT_SHA"] ?? process.env["GIT_COMMIT_SHA"] ?? null
}

function captureServerEvent(event: string, distinctId: string, properties: Record<string, PosthogScalar>) {
  if (!POSTHOG_KEY) {
    return
  }

  void fetch(`${POSTHOG_HOST}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: POSTHOG_KEY,
      event,
      properties: {
        distinct_id: distinctId,
        app_source: "relay-server",
        app: "web",
        environment: getServerEnvironment(),
        release: getServerRelease(),
        ...properties,
      },
    }),
  }).catch(() => {})
}

export function captureServerTelemetry(input: TelemetryEventInput) {
  if (!POSTHOG_KEY) {
    return
  }

  const event = sanitizeTelemetryEvent(input)
  const payload = buildPosthogEvent(event)

  captureServerEvent(payload.event, event.userId ?? "relay-server", payload.properties)
}

export function captureServerException(
  error: unknown,
  context: {
    distinctId?: string | null
    properties?: Record<string, PosthogScalar>
    path?: string
    method?: string
    requestId?: string | null
    durationMs?: number
  } = {}
) {
  if (!POSTHOG_KEY) {
    return
  }

  const sanitizedError = sanitizeError(error)
  if (!sanitizedError?.message) {
    return
  }

  captureServerEvent("$exception", context.distinctId ?? "relay-server", {
    ...context.properties,
    path: context.path ?? context.properties?.path ?? null,
    method: context.method ?? context.properties?.method ?? null,
    request_id: context.requestId ?? context.properties?.request_id ?? null,
    duration_ms: context.durationMs ?? context.properties?.duration_ms ?? null,
    $exception_message: sanitizedError.message,
    $exception_stack_trace_raw: sanitizedError.stack ?? null,
    $exception_type: sanitizedError.name ?? "Unknown",
  })
}
