import { NextResponse } from "next/server"

import { encryptSecret } from "@/server/lib/secret-crypto"
import {
  getGoogleIntegrationClient,
  isGoogleIntegrationConfigured,
} from "@/server/services/integrations/google-service"

const GOOGLE_AUTH_SCOPES = ["openid", "email", "profile"]

function googleRedirectUri(requestUrl: string) {
  const origin = new URL(requestUrl).origin
  return `${origin}/api/integrations/google/callback`
}

function resolveSafeNextPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback
  }

  return value
}

function resolveWebAuthIntent(value: string | null | undefined) {
  return value === "sign-up" ? "sign-up" : "sign-in"
}

function buildSignInHref(nextPath = "/dashboard") {
  return `/sign-in?next=${encodeURIComponent(resolveSafeNextPath(nextPath))}`
}

export async function GET(request: Request) {
  const url = new URL(request.url)

  if (!isGoogleIntegrationConfigured()) {
    return NextResponse.redirect(new URL(buildSignInHref("/dashboard"), url))
  }

  const client = getGoogleIntegrationClient()!
  const nextPath = resolveSafeNextPath(url.searchParams.get("next"), "/dashboard")
  const intent = resolveWebAuthIntent(url.searchParams.get("intent"))
  const state = encryptSecret(JSON.stringify({
    mode: "auth",
    nextPath,
    intent,
    ts: Date.now(),
  }))

  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: googleRedirectUri(request.url),
    response_type: "code",
    scope: GOOGLE_AUTH_SCOPES.join(" "),
    prompt: "select_account",
    state,
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
