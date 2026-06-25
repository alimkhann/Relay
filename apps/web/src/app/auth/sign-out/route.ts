import { NextResponse } from "next/server"

import { getSharedAuthCookieDomain } from "@/lib/auth/cookie-domain"
import { clearLocalSessionCookieFromResponse } from "@/lib/auth/local-session"
import { getAuthProvider } from "@/lib/auth/provider"
import { requireAuthServer } from "@/lib/auth/server"

const NEON_SESSION_COOKIE_NAMES = [
  "__Secure-neon-auth.session_token",
  "__Secure-neon-auth.local.session_data",
]

function wantsJsonResponse(request: Request) {
  return request.headers.get("accept")?.includes("application/json") ?? false
}

function clearNeonSessionCookies(response: NextResponse, url: URL) {
  const sharedDomain = getSharedAuthCookieDomain(url.hostname)
  for (const name of NEON_SESSION_COOKIE_NAMES) {
    response.cookies.set(name, "", {
      path: "/",
      expires: new Date(0),
      maxAge: 0,
      sameSite: "lax",
      secure: true,
      httpOnly: true,
    })
    if (sharedDomain) {
      response.cookies.set(name, "", {
        path: "/",
        expires: new Date(0),
        maxAge: 0,
        sameSite: "lax",
        secure: true,
        httpOnly: true,
        domain: sharedDomain,
      })
    }
  }
}

async function signOutResponse(request: Request) {
  const url = new URL(request.url)
  const returnUrl = new URL("/get-started", url)
  const wantsJson = wantsJsonResponse(request)

  if (getAuthProvider() === "local") {
    const response = wantsJson
      ? NextResponse.json({ redirectTo: returnUrl.pathname })
      : NextResponse.redirect(returnUrl, { status: 303 })
    return clearLocalSessionCookieFromResponse(response)
  }

  const authHandler = requireAuthServer().handler()
  const innerRequest = new Request(new URL("/api/auth/sign-out", url.origin), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: url.origin,
      Cookie: request.headers.get("cookie") ?? "",
    },
    body: "{}",
  })

  const authResponse = await authHandler.POST(innerRequest, {
    params: Promise.resolve({ path: ["sign-out"] }),
  })

  const response = wantsJson
    ? NextResponse.json({ redirectTo: returnUrl.pathname })
    : NextResponse.redirect(returnUrl, { status: 303 })
  for (const cookieHeader of authResponse.headers.getSetCookie()) {
    response.headers.append("Set-Cookie", cookieHeader)
  }
  clearNeonSessionCookies(response, url)
  return response
}

export async function GET(request: Request) {
  return signOutResponse(request)
}

export async function POST(request: Request) {
  return signOutResponse(request)
}
