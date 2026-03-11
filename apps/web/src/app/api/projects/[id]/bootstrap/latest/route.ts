import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer } from "@/server/policies/viewer"
import { getLatestBootstrapForProject } from "@/server/services/bootstrap-service"

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const targetProfileKey = searchParams.get("targetProfileKey") ?? "chatgpt_planning"
  const kind = (searchParams.get("kind") as "quick_continuity" | "fresh_chat_bootstrap" | null) ?? "fresh_chat_bootstrap"
  const packet = await getLatestBootstrapForProject(viewer.userId, id, targetProfileKey, kind)
  return NextResponse.json({ packet })
})
