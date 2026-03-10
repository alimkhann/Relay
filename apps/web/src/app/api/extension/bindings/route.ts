import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer } from "@/server/policies/viewer"
import { bindProject } from "@/server/services/binding-service"

export const POST = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const binding = await bindProject(viewer.userId, await request.json())
  return NextResponse.json({ binding }, { status: 201 })
})
