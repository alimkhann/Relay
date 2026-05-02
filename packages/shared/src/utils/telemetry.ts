import type { TelemetryErrorPayload, TelemetryEventInput } from "../types/telemetry"

const REDACTED_VALUE = "[redacted]"
const MAX_STRING_LENGTH = 600
const MAX_STACK_LENGTH = 4000
const MAX_DEPTH = 5

const REDACTED_KEY_PATTERN =
  /(^|[_-])(token|secret|cookie|authorization|password|passwd|idtoken|accesstoken|refreshtoken|setcookie|clientsecret)($|[_-])/i

function truncateString(value: string, limit = MAX_STRING_LENGTH) {
  return value.length <= limit ? value : `${value.slice(0, limit)}…`
}

function sanitizeValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>
): unknown {
  if (value == null) return value

  if (typeof value === "string") {
    return truncateString(value)
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }

  if (value instanceof Error) {
    return sanitizeError(value)
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return "[truncated]"
    return value.slice(0, 50).map((entry) => sanitizeValue(entry, depth + 1, seen))
  }

  if (typeof value === "object") {
    if (seen.has(value)) return "[circular]"
    seen.add(value)

    if (depth >= MAX_DEPTH) return "[truncated]"

    const output: Record<string, unknown> = {}

    for (const [key, entry] of Object.entries(value)) {
      if (REDACTED_KEY_PATTERN.test(key)) {
        output[key] = REDACTED_VALUE
        continue
      }

      output[key] = sanitizeValue(entry, depth + 1, seen)
    }

    return output
  }

  return String(value)
}

export function sanitizeError(error: unknown): TelemetryErrorPayload | null {
  if (!error) return null

  if (error instanceof Error) {
    return {
      name: error.name || null,
      message: truncateString(error.message, MAX_STRING_LENGTH) || null,
      stack: error.stack ? truncateString(error.stack, MAX_STACK_LENGTH) : null,
      cause: error.cause ? truncateString(String(error.cause), MAX_STRING_LENGTH) : null
    }
  }

  if (typeof error === "object") {
    const candidate = error as Record<string, unknown>
    return {
      name: candidate.name ? truncateString(String(candidate.name), MAX_STRING_LENGTH) : null,
      message: candidate.message ? truncateString(String(candidate.message), MAX_STRING_LENGTH) : truncateString(String(error), MAX_STRING_LENGTH),
      stack: candidate.stack ? truncateString(String(candidate.stack), MAX_STACK_LENGTH) : null,
      cause: candidate.cause ? truncateString(String(candidate.cause), MAX_STRING_LENGTH) : null
    }
  }

  return {
    name: null,
    message: truncateString(String(error), MAX_STRING_LENGTH),
    stack: null,
    cause: null
  }
}

export function sanitizeTelemetryEvent(input: TelemetryEventInput): TelemetryEventInput {
  const seen = new WeakSet<object>()

  return {
    ...input,
    timestamp: input.timestamp ?? new Date().toISOString(),
    requestId: input.requestId ?? null,
    flowId: input.flowId ?? null,
    userId: input.userId ?? null,
    projectId: input.projectId ?? null,
    sessionId: input.sessionId ?? null,
    tabId: input.tabId ?? null,
    url: input.url ? truncateString(input.url, 2000) : null,
    message: truncateString(input.message, 400),
    context: (sanitizeValue(input.context ?? {}, 0, seen) as Record<string, unknown>) ?? {},
    error: sanitizeError(input.error ?? null)
  }
}

export function createFlowId(prefix = "flow") {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

  return `${prefix}-${random}`
}
