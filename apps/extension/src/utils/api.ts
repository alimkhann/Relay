import { getRelaySession } from "../storage/session"

export interface RateLimitError {
  message: string
  retryAfterSeconds?: number
}

export async function readRateLimitError(response: Response): Promise<RateLimitError | null> {
  if (response.status !== 429) return null

  try {
    const body = (await response.json()) as {
      error?: string
      retryAfterSeconds?: number
      upgradeUrl?: string
    }

    const upgradeHint = body.upgradeUrl ? ` Upgrade at ${body.upgradeUrl}` : ""
    return {
      message: (body.error ?? "Too many requests. Please try again later.") + upgradeHint,
      retryAfterSeconds: body.retryAfterSeconds
    }
  } catch {
    return { message: "Too many requests. Please try again later." }
  }
}

const DEFAULT_FETCH_TIMEOUT_MS = 15_000

export async function relayFetch(path: string, init?: RequestInit) {
  const session = await getRelaySession()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT_MS)
  try {
    return await fetch(`${session.apiBase}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(session.token ? { authorization: `Bearer ${session.token}` } : {}),
        ...(init?.headers ?? {})
      }
    })
  } finally {
    clearTimeout(timeoutId)
  }
}
