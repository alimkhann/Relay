import { NextResponse } from "next/server"

import { encryptSecret } from "@/server/lib/secret-crypto"
import {
  getGoogleIntegrationClient,
  isGoogleIntegrationConfigured,
} from "@/server/services/integrations/google-service"

const GOOGLE_AUTH_SCOPES = ["openid", "email", "profile"]
type WebAuthIntent = "sign-in" | "sign-up"

function resolveWebAuthIntent(value: string | null | undefined): WebAuthIntent {
  return value === "sign-up" ? "sign-up" : "sign-in"
}

function resolveSafeNextPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback
  }

  return value
}

function resolveAuthenticatedAppPath(value: string | null | undefined = "/dashboard") {
  return resolveSafeNextPath(value, "/dashboard")
}

function buildSignInHref(nextPath = "/dashboard", options: { intent?: WebAuthIntent } = {}) {
  const params = new URLSearchParams({ next: resolveSafeNextPath(nextPath) })
  if (options.intent === "sign-up") {
    params.set("intent", "sign-up")
  }
  return `/sign-in?${params.toString()}`
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const nextPath = resolveAuthenticatedAppPath(resolveSafeNextPath(url.searchParams.get("next")))
  const intent = resolveWebAuthIntent(url.searchParams.get("intent"))
  const signInUrl = new URL(buildSignInHref(nextPath, { intent }), url)

  try {
    if (!isGoogleIntegrationConfigured()) {
      throw new Error("Google OAuth is not configured.")
    }

    const client = getGoogleIntegrationClient()!
    const state = encryptSecret(JSON.stringify({
      mode: "auth",
      nextPath,
      intent,
      ts: Date.now(),
    }))
    const params = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: `${url.origin}/api/integrations/google/callback`,
      response_type: "code",
      scope: GOOGLE_AUTH_SCOPES.join(" "),
      prompt: "select_account",
      state,
    })

    return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
  } catch {
    signInUrl.searchParams.set("google", "error")
    return NextResponse.redirect(signInUrl)
  }
}
