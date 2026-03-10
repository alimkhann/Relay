import { getRelaySession } from "../storage/session"

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
