import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"
import { bindProject, resolveBoundProject } from "@/server/services/binding-service"

export const GET = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  const { searchParams } = new URL(request.url)
  const result = await resolveBoundProject(viewer.userId, {
    domain: searchParams.get("domain"),
    tabId: searchParams.get("tabId"),
    platform: searchParams.get("platform")
  })

  return NextResponse.json({ binding: result })
})

export const POST = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  const binding = await bindProject(viewer.userId, await request.json())
  return NextResponse.json({ binding }, { status: 201 })
})
