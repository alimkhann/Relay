import { NextResponse } from "next/server"

import { logServerEvent } from "@/server/logging/logger"
import { captureServerEvent } from "@/lib/telemetry/posthog-server"
import { withApiRoute } from "@/server/http/api-route"
import { getSharedAuthCookieDomain } from "@/lib/auth/cookie-domain"
import { requireAuthServer } from "@/lib/auth/server"
import { decryptSecret } from "@/server/lib/secret-crypto"
import {
  createNeonAuthSession,
  resolveOrProvisionAuthUser,
  verifyGoogleIdentity,
} from "@/server/services/google-auth-service"
import {
  resolveAuthenticatedAppPath,
  resolveWebAuthIntent,
  type WebAuthIntent,
} from "@/server/policies/viewer"
import {
  exchangeGoogleAuthCode,
  upsertGoogleAccount,
} from "@/server/services/integrations/google-service"

const STATE_TTL_MS = 10 * 60 * 1000
const SESSION_TOKEN_COOKIE_NAME = "__Secure-neon-auth.session_token"

function settingsRedirect(requestUrl: string, status: "connected" | "error") {
  const origin = new URL(requestUrl).origin
  return NextResponse.redirect(`${origin}/settings?section=integrations&google=${status}`)
}

function signInRedirect(requestUrl: string, nextPath: string, status: "error", intent?: WebAuthIntent) {
  const origin = new URL(requestUrl).origin
  const url = new URL("/sign-in", origin)
  url.searchParams.set("next", nextPath)
  if (intent === "sign-up") {
    url.searchParams.set("intent", "sign-up")
  }
  url.searchParams.set("google", status)
  return NextResponse.redirect(url)
}

function decodeIdTokenEmail(idToken: string | undefined): string | null {
  // The id_token came directly from Google's token endpoint over TLS, so the
  // payload can be decoded without signature verification here.
  if (!idToken) return null
  const payload = idToken.split(".")[1]
  if (!payload) return null
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: string
    }
    return claims.email ?? null
  } catch {
    return null
  }
}

function readSessionTokenFromAuthPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null
  }

  const record = payload as Record<string, unknown>
  if (typeof record.token === "string" && record.token.length > 0) {
    return record.token
  }

  const session = record.session
  if (session && typeof session === "object") {
    const sessionRecord = session as Record<string, unknown>
    if (typeof sessionRecord.token === "string" && sessionRecord.token.length > 0) {
      return sessionRecord.token
    }
  }

  return null
}

function resolveExpiresAtMaxAge(expiresAt: Date | string | null | undefined) {
  if (!expiresAt) return undefined
  const expiresAtMs = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt)
  if (!Number.isFinite(expiresAtMs)) return undefined
  const maxAge = Math.floor((expiresAtMs - Date.now()) / 1000)
  return maxAge > 0 ? maxAge : undefined
}

function getClientIpAddress(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  )
}

async function handleAuthCallback(input: {
  request: Request
  code: string
  nextPath: string
  intent: WebAuthIntent
}) {
  const url = new URL(input.request.url)
  const redirectUri = `${url.origin}/api/integrations/google/callback`
  const tokens = await exchangeGoogleAuthCode(input.code, redirectUri)

  if (!tokens.id_token) {
    throw new Error("Google did not return an ID token.")
  }

  const authHandler = requireAuthServer().handler()
  const signInRequest = new Request(new URL("/api/auth/sign-in/social", url.origin), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: url.origin,
    },
    body: JSON.stringify({
      provider: "google",
      disableRedirect: true,
      requestSignUp: input.intent === "sign-up",
      idToken: {
        token: tokens.id_token,
        accessToken: tokens.access_token,
      },
    }),
  })

  const authResponse = await authHandler.POST(signInRequest, {
    params: Promise.resolve({ path: ["sign-in", "social"] }),
  })
  const authPayload = await authResponse.clone().json().catch(() => null)

  if (!authResponse.ok) {
    const errorMessage =
      authPayload && typeof authPayload === "object" && "message" in authPayload
        ? String(authPayload.message)
        : `Auth sign-in failed: ${authResponse.status}`
    throw new Error(errorMessage)
  }

  const setCookieHeaders = authResponse.headers.getSetCookie()
  const hasSessionToken = setCookieHeaders.some((cookieHeader) =>
    cookieHeader.startsWith(`${SESSION_TOKEN_COOKIE_NAME}=`)
  )
  const sessionTokenFromHeader =
    authResponse.headers.get("set-auth-jwt") ?? authResponse.headers.get("set-auth-token")
  const sessionTokenFromBody = readSessionTokenFromAuthPayload(authPayload)
  let fallbackSessionToken = sessionTokenFromHeader ?? sessionTokenFromBody
  let fallbackSessionMaxAge: number | undefined
  let usedManualSessionFallback = false

  if (!hasSessionToken && !fallbackSessionToken) {
    const googleUser = await verifyGoogleIdentity(tokens.access_token)
    const authUser = await resolveOrProvisionAuthUser({ googleUser })
    const session = await createNeonAuthSession({
      userId: authUser.id,
      ipAddress: getClientIpAddress(input.request),
      userAgent: input.request.headers.get("user-agent"),
    })
    fallbackSessionToken = session.token
    fallbackSessionMaxAge = resolveExpiresAtMaxAge(session.expiresAt)
    usedManualSessionFallback = true
  }

  const targetPath = resolveAuthenticatedAppPath(input.nextPath)
  const response = NextResponse.redirect(new URL(targetPath, url))
  for (const cookieHeader of setCookieHeaders) {
    response.headers.append("Set-Cookie", cookieHeader)
  }
  if (!hasSessionToken && fallbackSessionToken) {
    response.cookies.set(SESSION_TOKEN_COOKIE_NAME, fallbackSessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: fallbackSessionMaxAge,
      domain: getSharedAuthCookieDomain(url.hostname),
    })
  }

  await logServerEvent({
    level: "info",
    surface: "web-api",
    area: "auth",
    event: "google_auth.callback_session_established",
    message: "Google OAuth callback established a Relay web session.",
    context: {
      authIntent: input.intent,
      forwardedAuthCookies: setCookieHeaders.length,
      usedAuthHeaderFallback: Boolean(!hasSessionToken && sessionTokenFromHeader),
      usedAuthBodyFallback: Boolean(!hasSessionToken && !sessionTokenFromHeader && sessionTokenFromBody),
      usedManualSessionFallback,
    },
  })

  return response
}

export const GET = withApiRoute(async (request: Request) => {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  if (!code || !state) return settingsRedirect(request.url, "error")

  let parsed: { mode?: string; userId?: string; ts?: number; nextPath?: string; intent?: string }
  try {
    parsed = JSON.parse(decryptSecret(state)) as typeof parsed
    if (!parsed.ts || Date.now() - parsed.ts > STATE_TTL_MS) {
      if (parsed.mode === "auth" && parsed.nextPath) {
        return signInRedirect(
          request.url,
          parsed.nextPath,
          "error",
          resolveWebAuthIntent(parsed.intent),
        )
      }
      return settingsRedirect(request.url, "error")
    }
    if (parsed.mode !== "auth" && !parsed.userId) {
      return settingsRedirect(request.url, "error")
    }
  } catch {
    return settingsRedirect(request.url, "error")
  }

  if (parsed.mode === "auth") {
    const nextPath = resolveAuthenticatedAppPath(parsed.nextPath)
    try {
      return await handleAuthCallback({
        request,
        code,
        nextPath,
        intent: resolveWebAuthIntent(parsed.intent),
      })
    } catch (error) {
      await logServerEvent({
        level: "error",
        surface: "web-api",
        area: "auth",
        event: "google_auth.callback_failed",
        message: "Google OAuth auth callback failed.",
        context: {
          authIntent: resolveWebAuthIntent(parsed.intent),
          reason: error instanceof Error ? error.message : "unknown",
        },
        error,
      })
      return signInRedirect(request.url, nextPath, "error", resolveWebAuthIntent(parsed.intent))
    }
  }

  try {
    const redirectUri = `${url.origin}/api/integrations/google/callback`
    const tokens = await exchangeGoogleAuthCode(code, redirectUri)
    const email = decodeIdTokenEmail(tokens.id_token)
    if (!email) throw new Error("Google did not return an account email.")
    await upsertGoogleAccount(parsed.userId!, {
      email,
      tokens,
      scopes: tokens.scope?.split(" ") ?? [],
    })
    captureServerEvent({
      event: "integration_connected",
      distinctId: parsed.userId!,
      properties: { provider: "google", surface: "web-settings" },
    })
    return settingsRedirect(request.url, "connected")
  } catch (error) {
    await logServerEvent({
      level: "error",
      surface: "web-api",
      area: "integrations",
      event: "google.connect_failed",
      message: "Google OAuth callback failed.",
      userId: parsed.userId!,
      context: { reason: error instanceof Error ? error.message : "unknown" },
      error,
    })
    return settingsRedirect(request.url, "error")
  }
})
