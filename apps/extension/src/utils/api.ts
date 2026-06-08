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

export interface RelayFetchOptions {
  timeoutMs?: number
}

export async function relayFetch(path: string, init?: RequestInit, options?: RelayFetchOptions) {
  const session = await getRelaySession()
  const controller = new AbortController()
  const timeoutMs = options?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  // AbortSignal.any is Chrome 116+ but not yet in all TS lib versions — cast to use it.
  const signal = init?.signal
    ? (AbortSignal as any).any([controller.signal, init.signal]) as AbortSignal
    : controller.signal
  try {
    return await fetch(`${session.apiBase}${path}`, {
      ...init,
      signal,
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
