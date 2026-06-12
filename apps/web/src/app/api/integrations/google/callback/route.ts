import { NextResponse } from "next/server"

import { logServerEvent } from "@/server/logging/logger"
import { captureServerEvent } from "@/lib/telemetry/posthog-server"
import { withApiRoute } from "@/server/http/api-route"
import { decryptSecret } from "@/server/lib/secret-crypto"
import {
  exchangeGoogleAuthCode,
  upsertGoogleAccount,
} from "@/server/services/integrations/google-service"

const STATE_TTL_MS = 10 * 60 * 1000

function settingsRedirect(requestUrl: string, status: "connected" | "error") {
  const origin = new URL(requestUrl).origin
  return NextResponse.redirect(`${origin}/settings?section=integrations&google=${status}`)
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

export const GET = withApiRoute(async (request: Request) => {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  if (!code || !state) return settingsRedirect(request.url, "error")

  let userId: string
  try {
    const parsed = JSON.parse(decryptSecret(state)) as { userId?: string; ts?: number }
    if (!parsed.userId || !parsed.ts || Date.now() - parsed.ts > STATE_TTL_MS) {
      return settingsRedirect(request.url, "error")
    }
    userId = parsed.userId
  } catch {
    return settingsRedirect(request.url, "error")
  }

  try {
    const redirectUri = `${url.origin}/api/integrations/google/callback`
    const tokens = await exchangeGoogleAuthCode(code, redirectUri)
    const email = decodeIdTokenEmail(tokens.id_token)
    if (!email) throw new Error("Google did not return an account email.")
    await upsertGoogleAccount(userId, {
      email,
      tokens,
      scopes: tokens.scope?.split(" ") ?? [],
    })
    captureServerEvent({
      event: "integration_connected",
      distinctId: userId,
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
      userId,
      context: { reason: error instanceof Error ? error.message : "unknown" },
      error,
    })
    return settingsRedirect(request.url, "error")
  }
})
