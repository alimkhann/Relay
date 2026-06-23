import { NextResponse } from "next/server"

import { requireAuthServer } from "@/lib/auth/server"
import {
  buildSignInHref,
  resolveAuthenticatedAppPath,
  resolveWebAuthIntent,
} from "@/server/policies/viewer"

function resolveSafeNextPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback
  }

  return value
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const nextPath = resolveAuthenticatedAppPath(resolveSafeNextPath(url.searchParams.get("next")))
  const intent = resolveWebAuthIntent(url.searchParams.get("intent"))

  try {
    const authHandler = requireAuthServer().handler()
    const signInRequest = new Request(new URL("/api/auth/sign-in/social", url.origin), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: url.origin,
        Cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({
        provider: "google",
        callbackURL: nextPath,
        newUserCallbackURL: nextPath,
        errorCallbackURL: buildSignInHref(nextPath),
        disableRedirect: true,
        requestSignUp: intent === "sign-up",
      }),
    })

    const authResponse = await authHandler.POST(signInRequest, {
      params: Promise.resolve({ path: ["sign-in", "social"] }),
    })
    const payload = await authResponse.json().catch(() => null) as { url?: unknown } | null

    if (!authResponse.ok || typeof payload?.url !== "string") {
      throw new Error(`Auth social start failed: ${authResponse.status}`)
    }

    const response = NextResponse.redirect(payload.url)
    for (const cookieHeader of authResponse.headers.getSetCookie()) {
      response.headers.append("Set-Cookie", cookieHeader)
    }
    return response
  } catch {
    return NextResponse.redirect(new URL(`${buildSignInHref(nextPath)}&google=error`, url))
  }
}
