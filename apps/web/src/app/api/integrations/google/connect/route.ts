import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { encryptSecret } from "@/server/lib/secret-crypto"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"
import {
  GOOGLE_OAUTH_SCOPES,
  isGoogleIntegrationConfigured,
  getGoogleIntegrationClient,
} from "@/server/services/integrations/google-service"

// Use the request's own origin so localhost and prod both work with the
// OAuth client's registered redirect URIs.
function googleRedirectUri(requestUrl: string) {
  const origin = new URL(requestUrl).origin
  return `${origin}/api/integrations/google/callback`
}

export const GET = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  if (!isGoogleIntegrationConfigured()) {
    return NextResponse.json({ error: "Google integration is not configured." }, { status: 503 })
  }
  const client = getGoogleIntegrationClient()!

  // Tamper-proof state: encrypted {userId, ts} round-trips through Google and
  // authenticates the callback (callback has no Authorization header).
  const state = encryptSecret(JSON.stringify({ userId: viewer.userId, ts: Date.now() }))

  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: googleRedirectUri(request.url),
    response_type: "code",
    scope: GOOGLE_OAUTH_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  })
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
})
