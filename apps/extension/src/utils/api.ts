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

export async function relayFetch(path: string, init?: RequestInit) {
  const session = await getRelaySession()
  return fetch(`${session.apiBase}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(session.token ? { authorization: `Bearer ${session.token}` } : {}),
      ...(init?.headers ?? {})
    }
  })
}
