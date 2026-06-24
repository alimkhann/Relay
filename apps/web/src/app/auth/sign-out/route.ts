import { NextResponse } from "next/server"

import { getGoogleLogoutUrl } from "@/lib/auth/google-logout"
import { clearLocalSessionCookieFromResponse } from "@/lib/auth/local-session"
import { currentSessionUsesGoogle } from "@/lib/auth/provider-accounts"
import { getAuthProvider } from "@/lib/auth/provider"
import { requireAuthServer } from "@/lib/auth/server"

function wantsJsonResponse(request: Request) {
  return request.headers.get("accept")?.includes("application/json") ?? false
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
  const shouldSignOutOfGoogle = await currentSessionUsesGoogle(authHandler, request, url)
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
    ? NextResponse.json({
        redirectTo: returnUrl.pathname,
        googleLogoutUrl: shouldSignOutOfGoogle ? getGoogleLogoutUrl().toString() : undefined,
      })
    : NextResponse.redirect(returnUrl, { status: 303 })
  for (const cookieHeader of authResponse.headers.getSetCookie()) {
    response.headers.append("Set-Cookie", cookieHeader)
  }
  return response
}

export async function GET(request: Request) {
  return signOutResponse(request)
}

export async function POST(request: Request) {
  return signOutResponse(request)
}
