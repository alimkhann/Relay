import { NextResponse } from "next/server"
import { z } from "zod"

import { withApiAuth } from "@/server/http/api-route"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"
import { linkSessionToProjects } from "@/server/services/capture-service"

const bodySchema = z.object({
  projectIds: z.array(z.string().min(1)).min(1).max(10),
})

// Link an already-captured session to additional projects (sidebar
// "also save to…"). Gated behind the same flag as capture fan-out.
export const POST = withApiAuth(
  async (request: Request, { params }: { params: Promise<{ sessionId: string }> }) => {
    if (process.env.RELAY_MULTI_PROJECT_CAPTURE !== "true") {
      return NextResponse.json({ error: "Multi-project capture is not enabled." }, { status: 404 })
    }
    const viewer = await resolveViewer(request.headers.get("authorization"))
    rejectMcpViewer(viewer)
    const { sessionId } = await params
    const { projectIds } = bodySchema.parse(await request.json())
    const result = await linkSessionToProjects(viewer.userId, sessionId, projectIds)
    return NextResponse.json(result, { status: 201 })
  },
)
