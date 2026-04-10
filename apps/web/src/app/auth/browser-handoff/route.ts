import { NextResponse } from "next/server"

import { requireAuthServer } from "@/lib/auth/server"
import { buildSignInHref, resolveAuthenticatedAppPath } from "@/server/policies/viewer"
import { consumeBrowserSessionHandoff } from "@/server/services/browser-session-handoff-service"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get("token")?.trim()

  if (!token) {
    return NextResponse.redirect(new URL(buildSignInHref("/dashboard"), url))
  }

  try {
    const handoff = await consumeBrowserSessionHandoff(token)

    // Sign in via the Neon Auth handler directly so Set-Cookie headers are
    // captured on the HTTP response rather than relying on cookies().set()
    // which can be lost when returning NextResponse.redirect().
    const authHandler = requireAuthServer().handler()
    const signInRequest = new Request(new URL("/api/auth/sign-in/social", url.origin), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Origin": url.origin },
      body: JSON.stringify({
        provider: "google",
        disableRedirect: true,
        requestSignUp: true,
        idToken: {
          token: handoff.googleIdToken,
          accessToken: handoff.googleAccessToken
        }
      })
    })

    const authResponse = await authHandler.POST(signInRequest, {
      params: Promise.resolve({ path: ["sign-in", "social"] })
    })

    if (!authResponse.ok) {
      throw new Error(`Auth sign-in failed: ${authResponse.status}`)
    }

    // Forward auth session cookies from the sign-in response to the redirect
    const targetPath = resolveAuthenticatedAppPath(handoff.nextPath)
    const response = NextResponse.redirect(new URL(targetPath, url))
    for (const cookieHeader of authResponse.headers.getSetCookie()) {
      response.headers.append("Set-Cookie", cookieHeader)
    }

    return response
  } catch {
    return NextResponse.redirect(new URL(buildSignInHref("/dashboard"), url))
  }
}
