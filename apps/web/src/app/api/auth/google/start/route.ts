import { NextResponse } from "next/server"

import { requireAuthServer } from "@/lib/auth/server"
import { logServerEvent } from "@/server/logging/logger"
import {
  buildSignInHref,
  resolveAuthenticatedAppPath,
  resolveWebAuthIntent,
} from "@/server/policies/viewer"

const MAX_OAUTH_REDIRECT_HOPS = 5
const GOOGLE_AUTH_HOSTS = new Set(["accounts.google.com", "accounts.youtube.com"])

function resolveSafeNextPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback
  }

  return value
}

function getCookiePair(setCookieHeader: string) {
  return setCookieHeader.split(";")[0]?.trim() ?? ""
}

function buildCookieHeader(setCookieHeaders: string[]) {
  const cookies = new Map<string, string>()

  for (const header of setCookieHeaders) {
    const pair = getCookiePair(header)
    const separatorIndex = pair.indexOf("=")
    if (separatorIndex <= 0) continue
    cookies.set(pair.slice(0, separatorIndex), pair)
  }

  return [...cookies.values()].join("; ")
}

function appendAccountPickerPrompt(url: URL) {
  if (!GOOGLE_AUTH_HOSTS.has(url.hostname)) {
    return false
  }

  url.searchParams.set("prompt", "select_account")
  return true
}

function isAllowedOAuthHop(url: URL, requestOrigin: string) {
  if (url.protocol !== "https:") return false
  if (GOOGLE_AUTH_HOSTS.has(url.hostname)) return true

  const authBaseUrl = process.env.NEON_AUTH_BASE_URL
  if (authBaseUrl && url.origin === new URL(authBaseUrl).origin) return true

  return url.origin === requestOrigin && url.pathname.startsWith("/api/auth/")
}

async function resolveGoogleOAuthUrl(input: {
  authUrl: string
  requestUrl: string
  setCookieHeaders: string[]
}) {
  const requestOrigin = new URL(input.requestUrl).origin
  let currentUrl = new URL(input.authUrl, requestOrigin)
  const setCookieHeaders = [...input.setCookieHeaders]

  for (let hop = 0; hop < MAX_OAUTH_REDIRECT_HOPS; hop += 1) {
    if (appendAccountPickerPrompt(currentUrl)) {
      return {
        url: currentUrl,
        setCookieHeaders,
        redirectHopCount: hop,
      }
    }

    if (!isAllowedOAuthHop(currentUrl, requestOrigin)) {
      throw new Error(`Unexpected OAuth redirect host: ${currentUrl.origin}`)
    }

    const response = await fetch(currentUrl, {
      method: "GET",
      headers: {
        Cookie: buildCookieHeader(setCookieHeaders),
      },
      redirect: "manual",
      cache: "no-store",
    })
    setCookieHeaders.push(...response.headers.getSetCookie())

    const location = response.headers.get("location")
    if (!location || response.status < 300 || response.status >= 400) {
      throw new Error(`OAuth redirect did not reach Google: ${response.status}`)
    }

    currentUrl = new URL(location, currentUrl)
  }

  throw new Error("OAuth redirect exceeded hop limit before reaching Google.")
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

    const resolved = await resolveGoogleOAuthUrl({
      authUrl: payload.url,
      requestUrl: request.url,
      setCookieHeaders: authResponse.headers.getSetCookie(),
    })

    const response = NextResponse.redirect(resolved.url)
    for (const cookieHeader of resolved.setCookieHeaders) {
      response.headers.append("Set-Cookie", cookieHeader)
    }

    await logServerEvent({
      level: "info",
      surface: "web-api",
      area: "auth",
      event: "google_auth.start_redirect_resolved",
      message: "Resolved Neon Google OAuth redirect with account picker prompt.",
      context: {
        authIntent: intent,
        redirectHopCount: resolved.redirectHopCount,
        setCookieCount: resolved.setCookieHeaders.length,
      },
    })

    return response
  } catch (error) {
    await logServerEvent({
      level: "error",
      surface: "web-api",
      area: "auth",
      event: "google_auth.start_failed",
      message: "Failed to start Google OAuth.",
      context: {
        authIntent: intent,
        nextPath,
        reason: error instanceof Error ? error.message : "unknown",
      },
      error,
    })

    return NextResponse.redirect(new URL(`${buildSignInHref(nextPath)}&google=error`, url))
  }
}
