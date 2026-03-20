import { createHash, randomBytes } from "node:crypto"

import open from "open"
import pc from "picocolors"

interface StartResponse {
  pollingSecret: string
  sessionCode: string
  expiresAt: string
  appUrl: string
}

interface PollResponse {
  status: "pending" | "confirmed" | "invalid"
  token?: string
  apiBase?: string
}

export interface AuthResult {
  token: string
  apiBase: string
}

export interface ScopedMcpAuthResult {
  accessToken: string
  refreshToken: string
  accessExpiresAt: string
  refreshExpiresAt: string
  apiBase: string
}

interface StartMcpAuthResponse {
  sessionCode: string
  sessionSecret: string
  expiresAt: string
  appUrl: string
}

interface PollMcpAuthResponse {
  status: "pending" | "approved" | "invalid"
  accessToken?: string
  refreshToken?: string
  accessExpiresAt?: string
  refreshExpiresAt?: string
  apiBase?: string
}

interface AuthFlowOptions {
  openBrowser?: boolean
}

function shouldOpenBrowser(options?: AuthFlowOptions) {
  return options?.openBrowser !== false
}

async function maybeOpenBrowser(url: string, options?: AuthFlowOptions) {
  if (!shouldOpenBrowser(options)) {
    console.log("  Browser launch skipped. Open the URL above manually.")
    console.log()
    return
  }

  try {
    await open(url)
  } catch {
    console.log("  Could not open a browser automatically. Open the URL above manually.")
    console.log()
  }
}

export async function startAuthFlow(apiBase: string, options?: AuthFlowOptions): Promise<AuthResult> {
  const response = await fetch(`${apiBase}/api/cli/auth/start`, {
    method: "POST",
    headers: { "content-type": "application/json" }
  })

  if (!response.ok) {
    throw new Error(`Failed to start auth flow: ${response.status}`)
  }

  const data = (await response.json()) as StartResponse
  const confirmUrl = `${data.appUrl}/cli-onboarding?code=${data.sessionCode}`

  console.log()
  console.log(pc.bold("  Your session code:"))
  console.log()
  console.log(pc.bold(pc.cyan(`     ${data.sessionCode}`)))
  console.log()
  console.log(`  ${shouldOpenBrowser(options) ? "Opening browser to authorize..." : "Open this URL to authorize:"}`)
  console.log(pc.dim(`  ${confirmUrl}`))
  console.log()

  await maybeOpenBrowser(confirmUrl, options)

  return pollForConfirmation(apiBase, data.pollingSecret)
}

async function pollForConfirmation(apiBase: string, pollingSecret: string): Promise<AuthResult> {
  const maxAttempts = 90
  const intervalMs = 2000

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs)

    try {
      const response = await fetch(
        `${apiBase}/api/cli/auth/poll?secret=${encodeURIComponent(pollingSecret)}`
      )

      if (!response.ok) continue

      const data = (await response.json()) as PollResponse

      if (data.status === "confirmed" && data.token && data.apiBase) {
        return { token: data.token, apiBase: data.apiBase }
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sha256Base64Url(input: string) {
  return createHash("sha256").update(input).digest("base64url")
}

export async function startScopedMcpAuthFlow(apiBase: string, projectId: string, options?: AuthFlowOptions): Promise<ScopedMcpAuthResult> {
  const codeVerifier = randomBytes(32).toString("base64url")
  const codeChallenge = sha256Base64Url(codeVerifier)

  const response = await fetch(`${apiBase}/api/mcp/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId,
      codeChallenge,
      scopes: ["project:read", "project:write", "memory:read", "memory:write", "brief:read"]
    })
  })

  if (!response.ok) {
    throw new Error(`Failed to start MCP auth flow: ${response.status}`)
  }

  const data = await response.json() as StartMcpAuthResponse
  const confirmUrl = `${data.appUrl}/mcp/authorize?code=${data.sessionCode}`

  console.log()
  console.log(pc.bold("  Approve scoped MCP access:"))
  console.log()
  console.log(pc.bold(pc.cyan(`     ${data.sessionCode}`)))
  console.log()
  console.log(`  ${shouldOpenBrowser(options) ? "Opening browser for MCP approval..." : "Open this URL for MCP approval:"}`)
  console.log(pc.dim(`  ${confirmUrl}`))
  console.log()

  await maybeOpenBrowser(confirmUrl, options)

  const maxAttempts = 90
  for (let index = 0; index < maxAttempts; index += 1) {
    await sleep(2000)
    const pollResponse = await fetch(`${apiBase}/api/mcp/token/poll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret: data.sessionSecret,
        codeVerifier
      })
    })

    if (!pollResponse.ok) continue
    const pollData = await pollResponse.json() as PollMcpAuthResponse

    if (
      pollData.status === "approved" &&
      pollData.accessToken &&
      pollData.refreshToken &&
      pollData.accessExpiresAt &&
      pollData.refreshExpiresAt &&
      pollData.apiBase
    ) {
      return {
        accessToken: pollData.accessToken,
        refreshToken: pollData.refreshToken,
        accessExpiresAt: pollData.accessExpiresAt,
        refreshExpiresAt: pollData.refreshExpiresAt,
        apiBase: pollData.apiBase,
      }
    }

    if (pollData.status === "invalid") {
      throw new Error("MCP authorization session expired or became invalid.")
    }
  }

  throw new Error("MCP authorization timed out. Please try again.")
}
