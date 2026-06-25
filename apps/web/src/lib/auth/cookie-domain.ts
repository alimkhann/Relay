export function getSharedAuthCookieDomain(hostOrOrigin?: string | null) {
  const configuredOrigin = process.env.NEXT_PUBLIC_RELAY_APP_URL ?? null
  const candidate = hostOrOrigin ?? configuredOrigin
  if (!candidate) return undefined

  let hostname = candidate
  try {
    hostname = new URL(candidate.startsWith("http") ? candidate : `https://${candidate}`).hostname
  } catch {
    hostname = candidate
  }

  return hostname === "onrelay.app" || hostname.endsWith(".onrelay.app")
    ? ".onrelay.app"
    : undefined
}
