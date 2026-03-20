import { createHash } from "node:crypto"

import { PostHog } from "posthog-node"

interface ViewerResponse {
  userId: string
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

export class RelayMcpAnalytics {
  private readonly client: PostHog | null
  private distinctId: string | null = null

  constructor() {
    const config = getPosthogConfig()
    this.client = config
      ? new PostHog(config.key, {
          host: config.host,
          flushAt: 1,
          flushInterval: 0,
        })
      : null
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

    this.distinctId = `relay-mcp:${hashToken(token)}`
  }

  capture(event: string, properties: Record<string, string | number | boolean | null>) {
    if (!this.client || !this.distinctId) return

    this.client.capture({
      distinctId: this.distinctId,
      event,
      properties: {
        source: "relay-mcp",
        ...properties,
      },
    })
  }

  async shutdown() {
    await this.client?.shutdown()
  }
}
