import type { WebAuthIntent } from "@/server/policies/viewer"

export type RelayAuthMethod = "google" | "local"

export function withAuthCallbackParams(
  path: string,
  input: {
    method: RelayAuthMethod
    intent: WebAuthIntent
  }
) {
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://relay.local"
    const url = new URL(path.startsWith("/") ? `${base}${path}` : path)
    url.searchParams.set("auth_callback", "1")
    url.searchParams.set("auth_method", input.method)
    url.searchParams.set("auth_intent", input.intent)
    return `${url.pathname}${url.search}`
  } catch {
    return path
  }
}
