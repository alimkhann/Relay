import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"
import {
  disconnectGoogleForUser,
  getGoogleAccountForUser,
  isGoogleIntegrationConfigured,
} from "@/server/services/integrations/google-service"

export const GET = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  const account = await getGoogleAccountForUser(viewer.userId)
  return NextResponse.json({
    configured: isGoogleIntegrationConfigured(),
    connected: Boolean(account),
    email: account?.email ?? null,
    scopes: account?.scopes ?? [],
  })
})

export const DELETE = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  await disconnectGoogleForUser(viewer.userId)
  return NextResponse.json({ ok: true })
})
