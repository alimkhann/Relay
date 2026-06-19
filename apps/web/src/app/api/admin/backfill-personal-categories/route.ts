import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, rejectMcpViewer } from "@/server/policies/viewer"
import { backfillPersonalCategories } from "@/server/services/personal-memory-service"

/**
 * One-time backfill for the signed-in user's Personal project: classifies
 * memory items that have no Folk category (legacy items, or agent/MCP writes
 * that set only `type`) and regenerates the "About you" summary. Idempotent.
 */
export const POST = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)

  const body = (await request.json().catch(() => ({}))) as { limit?: number }
  const limit = Math.min(body.limit ?? 500, 1000)

  const result = await backfillPersonalCategories(viewer.userId, { limit })

  return NextResponse.json(result)
})
