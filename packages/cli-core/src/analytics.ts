import { createHash, randomUUID } from "node:crypto"
import { homedir } from "node:os"

import { PostHog } from "posthog-node"

interface ViewerResponse {
  userId: string
}

export type RelayNodeAnalyticsProperties = Record<string, string | number | boolean | null>

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

export class RelayNodeAnalytics {
  private readonly client: PostHog | null
  private distinctId: string | null

  constructor(
    private readonly options: {
      app: "cli" | "mcp" | "wizard"
      appSource: string
      anonymousPrefix: string
      appVersion?: string | null
    }
  ) {
    const config = getPosthogConfig()
    this.client = config
      ? new PostHog(config.key, {
          host: config.host,
          flushAt: 1,
          flushInterval: 0,
        })
      : null

    this.distinctId = this.client ? `${options.anonymousPrefix}:${randomUUID()}` : null
    if (this.client) {
      void this.client.register({
        app_source: options.appSource,
        app: options.app,
        platform: options.app,
        app_version: options.appVersion ?? process.env["npm_package_version"] ?? null,
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
        this.distinctId = viewer.userId
        return
      }
    } catch {
      // Fall back to an anonymous token fingerprint.
    }

    this.distinctId = `${this.options.anonymousPrefix}:${hashToken(token)}`
  }

  capture(event: string, properties: RelayNodeAnalyticsProperties = {}) {
    if (!this.client || !this.distinctId) return

    this.client.capture({
      distinctId: this.distinctId,
      event,
      properties,
    })
  }

  captureException(error: unknown, properties: RelayNodeAnalyticsProperties = {}) {
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
