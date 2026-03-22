import { createRepositoryBundle } from "@relay/db"
import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, rejectMcpViewer } from "@/server/policies/viewer"
import { backfillMissingEmbeddings } from "@/server/services/embedding-service"

export const POST = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)

  const body = (await request.json().catch(() => ({}))) as { limit?: number }
  const limit = Math.min(body.limit ?? 100, 500)

  const repos = createRepositoryBundle(viewer.userId)
  const count = await backfillMissingEmbeddings(repos, limit)

  return NextResponse.json({ embedded: count, limit })
})
