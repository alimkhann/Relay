import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { consumeMcpReadQuota } from "@/server/services/entitlement-service"
import { searchMemoryItems } from "@/server/services/memory-service"

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "memory:read")
  if (viewer.mode === "mcp") {
    await consumeMcpReadQuota(viewer.userId)
  }
  const url = new URL(request.url)
  const query = url.searchParams.get("q")

  if (!query) {
    return NextResponse.json({ error: "Missing required query parameter: q" }, { status: 400 })
  }

  const typesParam = url.searchParams.get("types")
  const tagsParam = url.searchParams.get("tags")
  const types = typesParam ? typesParam.split(",").filter(Boolean) : undefined
  const tags = tagsParam ? tagsParam.split(",").filter(Boolean) : undefined

  const { memoryResults, canonResults, queryAnalysis, evidenceTable, currentPreviousHint, temporalHint } = await searchMemoryItems(viewer.userId, id, query, { types, tags })
  return NextResponse.json({ results: memoryResults, canon: canonResults, queryAnalysis, evidenceTable, currentPreviousHint, temporalHint })
})
