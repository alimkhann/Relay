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

export async function startAuthFlow(apiBase: string): Promise<AuthResult> {
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
  console.log(`  Opening browser to authorize...`)
  console.log(pc.dim(`  ${confirmUrl}`))
  console.log()

  await open(confirmUrl)

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
