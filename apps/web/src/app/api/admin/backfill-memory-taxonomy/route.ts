import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, rejectMcpViewer } from "@/server/policies/viewer"
import { backfillMemoryTaxonomyForUser } from "@/server/services/memory-taxonomy-backfill-service"

/**
 * One-time taxonomy backfill for the signed-in user:
 * - Personal project: stamps metadata.personalCategory for uncategorized facts.
 * - Regular projects: reclassifies legacy agent/MCP-created note rows into the
 *   project memory type enum and marks attempted rows so re-runs are idempotent.
 */
export const POST = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)

  const body = (await request.json().catch(() => ({}))) as {
    limit?: number
    includePersonalCategories?: boolean
    includeProjectTypes?: boolean
  }

  const result = await backfillMemoryTaxonomyForUser(viewer.userId, {
    limit: body.limit,
    includePersonalCategories: body.includePersonalCategories,
    includeProjectTypes: body.includeProjectTypes,
  })

  return NextResponse.json(result)
})
