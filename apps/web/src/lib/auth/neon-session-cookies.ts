import type { NextResponse } from "next/server"

import { getSharedAuthCookieDomain } from "@/lib/auth/cookie-domain"

const NEON_SESSION_COOKIE_NAMES = [
  "__Secure-neon-auth.session_token",
  "__Secure-neon-auth.local.session_data",
]

function expiredSessionCookie(name: string, domain?: string) {
  return [
    `${name}=`,
    "Path=/",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
    domain ? `Domain=${domain}` : null,
    "Secure",
    "HttpOnly",
    "SameSite=Lax",
  ].filter(Boolean).join("; ")
}

export function clearNeonSessionCookiesFromResponse(response: NextResponse, url: URL) {
  const sharedDomain = getSharedAuthCookieDomain(url.hostname)

  for (const name of NEON_SESSION_COOKIE_NAMES) {
    response.headers.append("Set-Cookie", expiredSessionCookie(name))

    if (sharedDomain) {
      response.headers.append("Set-Cookie", expiredSessionCookie(name, sharedDomain))
    }
  }

  return response
}
