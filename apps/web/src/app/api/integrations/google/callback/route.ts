import { NextResponse } from "next/server"

import { logServerEvent } from "@/server/logging/logger"
import { captureServerEvent } from "@/lib/telemetry/posthog-server"
import { withApiRoute } from "@/server/http/api-route"
import { requireAuthServer } from "@/lib/auth/server"
import { decryptSecret } from "@/server/lib/secret-crypto"
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

interface AuthSignInPayload {
  token?: unknown
  session?: {
    expiresAt?: unknown
  } | null
}

function settingsRedirect(requestUrl: string, status: "connected" | "error") {
  const origin = new URL(requestUrl).origin
  return NextResponse.redirect(`${origin}/settings?section=integrations&google=${status}`)
}

function signInRedirect(requestUrl: string, nextPath: string, status: "error") {
  const origin = new URL(requestUrl).origin
  return NextResponse.redirect(`${origin}/sign-in?next=${encodeURIComponent(nextPath)}&google=${status}`)
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

function hasSessionTokenCookie(cookieHeaders: string[]) {
  return cookieHeaders.some((header) => header.startsWith(`${SESSION_TOKEN_COOKIE_NAME}=`))
}

function resolveSessionTokenMaxAge(payload: AuthSignInPayload | null) {
  const expiresAt = payload?.session?.expiresAt
  if (typeof expiresAt !== "string") return undefined

  const expiresAtMs = Date.parse(expiresAt)
  if (!Number.isFinite(expiresAtMs)) return undefined

  const maxAge = Math.floor((expiresAtMs - Date.now()) / 1000)
  return maxAge > 0 ? maxAge : undefined
}

async function handleAuthCallback(input: {
  requestUrl: string
  code: string
  nextPath: string
  intent: WebAuthIntent
}) {
  const url = new URL(input.requestUrl)
  const redirectUri = `${url.origin}/api/integrations/google/callback`
  const tokens = await exchangeGoogleAuthCode(input.code, redirectUri)

  if (!tokens.id_token) {
    throw new Error("Google did not return an ID token.")
  }

  const authHandler = requireAuthServer().handler()
  const targetPath = resolveAuthenticatedAppPath(input.nextPath)
  const signInRequest = new Request(new URL("/api/auth/sign-in/social", url.origin), {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": url.origin },
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
  const authPayload = await authResponse.json().catch(() => null) as AuthSignInPayload | null

  if (!authResponse.ok) {
    throw new Error(`Auth sign-in failed: ${authResponse.status}`)
  }

  const response = NextResponse.redirect(new URL(targetPath, url))
  const cookieHeaders = authResponse.headers.getSetCookie()
  for (const cookieHeader of cookieHeaders) {
    response.headers.append("Set-Cookie", cookieHeader)
  }

  const sessionToken = typeof authPayload?.token === "string" ? authPayload.token : null
  const sessionCookieForwarded = hasSessionTokenCookie(cookieHeaders)
  if (!sessionCookieForwarded && sessionToken) {
    response.cookies.set(SESSION_TOKEN_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: resolveSessionTokenMaxAge(authPayload),
    })
  }

  if (!sessionCookieForwarded && !sessionToken) {
    throw new Error("Auth sign-in did not return a session cookie or token.")
  }

  await logServerEvent({
    level: "info",
    surface: "web-api",
    area: "auth",
    event: "google_auth.callback_session_established",
    message: "Google OAuth callback established a Relay web session.",
    context: {
      authIntent: input.intent,
      forwardedCookieCount: cookieHeaders.length,
      usedSessionTokenFallback: !sessionCookieForwarded && Boolean(sessionToken),
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
        return signInRedirect(request.url, parsed.nextPath, "error")
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
        requestUrl: request.url,
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
      return signInRedirect(request.url, nextPath, "error")
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
