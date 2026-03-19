import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"
import { listGroupedActivityForProject } from "@/server/services/activity-service"

/**
 * GET /api/projects/[id]/activity
 * Returns grouped activity feed for a project (compressed by conversation).
 *
 * Query params:
 * - limit: number (default 20)
 * - includeArchived: boolean (default false)
 */
export const GET = withApiAuth(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const viewer = await resolveViewer(request.headers.get("authorization"))
    rejectMcpViewer(viewer)
    const { id: projectId } = await params
    const url = new URL(request.url)

    const limit = Math.min(
      Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20),
      100,
    )
    const includeArchived = url.searchParams.get("includeArchived") === "true"

    const activity = await listGroupedActivityForProject(viewer.userId, projectId, {
      limit,
      includeArchived,
    })

    return NextResponse.json({ activity })
  },
)
