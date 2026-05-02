import { createHash, randomUUID } from "node:crypto"
import { homedir } from "node:os"

import { PostHog } from "posthog-node"

interface ViewerResponse {
  userId: string
  mode?: string | null
  projectId?: string | null
  name?: string | null
  email?: string | null
}

function getPosthogConfig() {
  const key = process.env["RELAY_POSTHOG_KEY"] ?? process.env["NEXT_PUBLIC_POSTHOG_KEY"]

  if (!key) {
    return null
  }

  return {
    key,
    host: process.env["RELAY_POSTHOG_HOST"] ?? process.env["NEXT_PUBLIC_POSTHOG_HOST"] ?? "https://eu.i.posthog.com",
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function sanitizeException(error: unknown) {
  const normalized = error instanceof Error ? error : new Error(String(error))
  const nextStack = normalized.stack
    ?.replaceAll(process.cwd(), "<cwd>")
    .replaceAll(homedir(), "<home>")

  return {
    name: normalized.name || "Error",
    message: normalized.message || String(error),
    stack: nextStack ?? null,
  }
}

export class RelayMcpAnalytics {
  private readonly client: PostHog | null
  private distinctId: string | null

  constructor() {
    const config = getPosthogConfig()
    this.client = config
      ? new PostHog(config.key, {
          host: config.host,
          flushAt: 1,
          flushInterval: 0,
        })
      : null

    this.distinctId = this.client ? `relay-mcp:${randomUUID()}` : null
    if (this.client) {
      void this.client.register({
        app_source: "relay-mcp",
        app: "mcp",
        environment: process.env.NODE_ENV ?? "development",
      })
    }
  }

  async identify(apiBase: string, token: string) {
    if (!this.client) return

    try {
      const response = await fetch(`${apiBase.replace(/\/+$/, "")}/api/viewer`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      })

      if (response.ok) {
        const viewer = (await response.json()) as ViewerResponse
        const previousDistinctId = this.distinctId
        this.distinctId = viewer.userId
        this.client.identify({
          distinctId: viewer.userId,
          properties: {
            name: viewer.name ?? null,
            email: viewer.email ?? null,
            auth_mode: viewer.mode ?? null,
            project_id: viewer.projectId ?? null,
            ...(previousDistinctId && previousDistinctId !== viewer.userId
              ? { $anon_distinct_id: previousDistinctId }
              : {}),
          },
        })
        return
      }
    } catch {
      // Fall back to an anonymous token fingerprint.
    }

    this.distinctId = `relay-mcp:${hashToken(token)}`
  }

  capture(event: string, properties: Record<string, string | number | boolean | null>) {
    if (!this.client || !this.distinctId) return

    this.client.capture({
      distinctId: this.distinctId,
      event,
      properties,
    })
  }

  captureException(error: unknown, properties: Record<string, string | number | boolean | null> = {}) {
    if (!this.client || !this.distinctId) return

    const normalizedError = sanitizeException(error)

    this.client.capture({
      distinctId: this.distinctId,
      event: "$exception",
      properties: {
        ...properties,
        $exception_message: normalizedError.message,
        $exception_stack_trace_raw: normalizedError.stack,
        $exception_type: normalizedError.name,
      },
    })
  }

  async shutdown() {
    await this.client?.shutdown()
  }
}
