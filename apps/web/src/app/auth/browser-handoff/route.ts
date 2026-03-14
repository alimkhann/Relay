import { NextResponse } from "next/server"

import { buildSignInHref, resolveAuthenticatedAppPath } from "@/server/policies/viewer"
import { consumeBrowserSessionHandoff } from "@/server/services/browser-session-handoff-service"
import { resolveGoogleAuthUser } from "@/server/services/google-auth-service"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get("token")?.trim()

  if (!token) {
    return NextResponse.redirect(new URL(buildSignInHref("/dashboard"), url))
  }

  try {
    const handoff = await consumeBrowserSessionHandoff(token)
    await resolveGoogleAuthUser({
      googleAccessToken: handoff.googleAccessToken,
      googleIdToken: handoff.googleIdToken,
      allowProvisionFallback: false
    })

    return NextResponse.redirect(new URL(resolveAuthenticatedAppPath(handoff.nextPath), url))
  } catch {
    return NextResponse.redirect(new URL(buildSignInHref("/dashboard"), url))
  }
}
