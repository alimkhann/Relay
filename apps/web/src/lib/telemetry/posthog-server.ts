const POSTHOG_KEY = process.env["RELAY_POSTHOG_KEY"] ?? process.env["NEXT_PUBLIC_POSTHOG_KEY"]
const POSTHOG_HOST = process.env["RELAY_POSTHOG_HOST"] ?? process.env["NEXT_PUBLIC_POSTHOG_HOST"] ?? "https://eu.i.posthog.com"

export function captureServerException(
  error: unknown,
  context: {
    path: string
    method: string
    requestId: string | null
    durationMs: number
  }
) {
  if (!POSTHOG_KEY) return

  const errorMessage = error instanceof Error ? error.message : String(error)
  const errorStack = error instanceof Error ? error.stack : undefined

  const payload = {
    api_key: POSTHOG_KEY,
    batch: [
      {
        event: "$exception",
        distinct_id: "server",
        properties: {
          $exception_message: errorMessage,
          $exception_stack_trace_raw: errorStack,
          $exception_type: error instanceof Error ? error.constructor.name : "Unknown",
          path: context.path,
          method: context.method,
          request_id: context.requestId,
          duration_ms: context.durationMs,
          source: "api-server",
        },
        timestamp: new Date().toISOString(),
      },
    ],
  }

  void fetch(`${POSTHOG_HOST}/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {})
}
