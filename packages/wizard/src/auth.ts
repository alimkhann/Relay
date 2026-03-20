import { createHash, randomBytes } from "node:crypto"

import open from "open"
import pc from "picocolors"

import { step } from "@relay/cli-core"

export interface UnifiedAuthResult {
  token: string
  accessToken: string
  refreshToken: string
  accessExpiresAt: string
  refreshExpiresAt: string
  apiBase: string
}

interface WizardAuthStartResponse {
  sessionCode: string
  pollingSecret: string
  expiresAt: string
  appUrl: string
}

interface WizardAuthPollResponse {
  status: "pending" | "confirmed" | "invalid"
  cliToken?: string
  accessToken?: string
  refreshToken?: string
  accessExpiresAt?: string
  refreshExpiresAt?: string
  apiBase?: string
}

function sha256Base64Url(input: string) {
  return createHash("sha256").update(input).digest("base64url")
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Unified auth flow: one browser visit grants both CLI token and scoped MCP token.
 * Falls back to legacy two-step auth if the wizard endpoint isn't available.
 */
export async function startUnifiedAuthFlow(
  apiBase: string,
  projectId: string,
  options?: { openBrowser?: boolean }
): Promise<UnifiedAuthResult> {
  const codeVerifier = randomBytes(32).toString("base64url")
  const codeChallenge = sha256Base64Url(codeVerifier)

  const response = await fetch(`${apiBase}/api/wizard/auth/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      codeChallenge,
      projectId,
      scopes: ["project:read", "project:write", "memory:read", "memory:write", "brief:read"]
    })
  })

  if (!response.ok) {
    throw new Error(`Failed to start unified auth flow: ${response.status}`)
  }

  const data = (await response.json()) as WizardAuthStartResponse
  const confirmUrl = `${data.appUrl}/wizard-onboarding?code=${data.sessionCode}`

  console.log()
  console.log(pc.bold("  Your session code:"))
  console.log()
  console.log(pc.bold(pc.cyan(`     ${data.sessionCode}`)))
  console.log()

  const shouldOpen = options?.openBrowser !== false

  if (shouldOpen) {
    console.log("  Opening browser to authorize...")
    console.log(pc.dim(`  ${confirmUrl}`))
    console.log()
    try {
      await open(confirmUrl)
    } catch {
      console.log("  Could not open browser automatically. Open the URL above manually.")
      console.log()
    }
  } else {
    console.log("  Open this URL to authorize:")
    console.log(pc.dim(`  ${confirmUrl}`))
    console.log()
  }

  step("Waiting for browser confirmation...")

  return pollForUnifiedAuth(apiBase, data.pollingSecret, codeVerifier)
}

async function pollForUnifiedAuth(
  apiBase: string,
  pollingSecret: string,
  codeVerifier: string
): Promise<UnifiedAuthResult> {
  const maxAttempts = 90
  const intervalMs = 2000

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs)

    try {
      const response = await fetch(
        `${apiBase}/api/wizard/auth/poll?secret=${encodeURIComponent(pollingSecret)}&codeVerifier=${encodeURIComponent(codeVerifier)}`
      )

      if (!response.ok) continue

      const data = (await response.json()) as WizardAuthPollResponse

      if (
        data.status === "confirmed" &&
        data.cliToken &&
        data.accessToken &&
        data.refreshToken &&
        data.accessExpiresAt &&
        data.refreshExpiresAt &&
        data.apiBase
      ) {
        return {
          token: data.cliToken,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          accessExpiresAt: data.accessExpiresAt,
          refreshExpiresAt: data.refreshExpiresAt,
          apiBase: data.apiBase,
        }
      }

      if (data.status === "invalid") {
        throw new Error("Session expired or invalid. Please try again.")
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Session expired")) {
        throw error
      }
    }
  }

  throw new Error("Authorization timed out. Please try again.")
}
