import { consumeIpRateLimit } from "./entitlement-service"

function getFirstForwardedIp(value: string | null) {
  return value?.split(",")[0]?.trim() ?? null
}

export function getRequestIp(request: Request) {
  return (
    getFirstForwardedIp(request.headers.get("x-forwarded-for")) ??
    request.headers.get("x-real-ip") ??
    "unknown"
  )
}

export async function assertIpRateLimit(request: Request, featureKey: string, perMinuteLimit: number) {
  const ip = getRequestIp(request)
  return consumeIpRateLimit(`ip:${ip}`, featureKey, perMinuteLimit)
}
