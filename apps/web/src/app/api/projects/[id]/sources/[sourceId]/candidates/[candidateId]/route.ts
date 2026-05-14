import { NextResponse } from "next/server"

import { sourceCandidateReviewSchema } from "@relay/shared"
import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { reviewSourceFactCandidate } from "@/server/services/source-service"

export const PATCH = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string; sourceId: string; candidateId: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id, sourceId, candidateId } = await params
  requireViewerProject(viewer, id, "memory:write")
  const parsed = sourceCandidateReviewSchema.parse(await request.json())
  const result = await reviewSourceFactCandidate(viewer.userId, id, sourceId, candidateId, parsed.action)
  return NextResponse.json(result)
})
